// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('cd-patient-search'),
  patientResults: document.getElementById('cd-patient-results'),
  patientIdField: document.getElementById('cd-patient-id'),
  selectedPatientLabel: document.getElementById('cd-selected-patient'),
  program: document.getElementById('cd-program'),
  notes: document.getElementById('cd-notes'),
  enrollBtn: document.getElementById('enroll-btn'),
  enrollStatus: document.getElementById('enroll-status'),
  programFilter: document.getElementById('program-filter'),
  enrollmentsList: document.getElementById('enrollments-list'),
};

let patients = [];
let enrollments = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('chronic_enrollments').select('id').limit(1);
  const dot = document.getElementById('conn-dot');
  const label = document.getElementById('conn-label');
  if (error) {
    dot.className = 'dot offline';
    label.textContent = 'Connection error';
    return false;
  }
  dot.className = 'dot online';
  label.textContent = 'Connected';
  return true;
}

// ---------- Patients (for search) ----------
async function loadPatients() {
  const { data, error } = await client.from('patients').select('id, first_name, surname, upi, phone');
  if (!error) patients = data || [];
}

els.patientSearch.addEventListener('input', () => {
  const q = els.patientSearch.value.trim().toLowerCase();
  els.patientIdField.value = '';
  if (!q) { els.patientResults.innerHTML = ''; return; }

  const matches = patients.filter(p =>
    `${p.first_name} ${p.surname}`.toLowerCase().includes(q) ||
    (p.upi || '').toLowerCase().includes(q) ||
    (p.phone || '').includes(q)
  ).slice(0, 8);

  els.patientResults.innerHTML = matches.map(p => `
    <div class="search-result" data-id="${p.id}" data-name="${p.first_name} ${p.surname}">
      ${p.first_name} ${p.surname} — ${p.upi}
    </div>
  `).join('');

  els.patientResults.querySelectorAll('.search-result').forEach(row => {
    row.addEventListener('click', () => {
      els.patientIdField.value = row.dataset.id;
      els.patientSearch.value = row.dataset.name;
      els.patientResults.innerHTML = '';
      els.selectedPatientLabel.textContent = `Selected: ${row.dataset.name}`;
      els.selectedPatientLabel.className = 'form-status ok';
    });
  });
});

// ---------- Enroll ----------
els.enrollBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  if (!patientId) {
    els.enrollStatus.textContent = 'Select a patient first.';
    els.enrollStatus.className = 'form-status err';
    return;
  }

  els.enrollStatus.textContent = 'Enrolling…';
  els.enrollStatus.className = 'form-status';

  const { error } = await client.from('chronic_enrollments').insert([{
    patient_id: patientId,
    program: els.program.value,
    notes: els.notes.value.trim(),
  }]);

  if (error) {
    els.enrollStatus.textContent = `Couldn't enroll: ${error.message}`;
    els.enrollStatus.className = 'form-status err';
    return;
  }

  els.enrollStatus.textContent = 'Patient enrolled.';
  els.enrollStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.notes.value = '';

  await loadEnrollments();
});

// ---------- Active enrollments ----------
els.programFilter.addEventListener('change', loadEnrollments);

async function loadEnrollments() {
  let query = client.from('chronic_enrollments').select('*').eq('status', 'active');
  if (els.programFilter.value) query = query.eq('program', els.programFilter.value);

  const { data, error } = await query.order('enrollment_date', { ascending: false });

  if (error) {
    els.enrollmentsList.innerHTML = `<p class="empty-state">Couldn't load enrollments.</p>`;
    return;
  }
  enrollments = data || [];

  if (!enrollments.length) {
    els.enrollmentsList.innerHTML = `<p class="empty-state">No active enrollments.</p>`;
    return;
  }

  // fetch latest visit per enrollment to check overdue status
  const { data: allVisits } = await client
    .from('chronic_visits')
    .select('enrollment_id, next_visit_date')
    .in('enrollment_id', enrollments.map(e => e.id));

  const today = new Date().toISOString().slice(0, 10);
  const overdueSet = new Set();
  (allVisits || []).forEach(v => {
    if (v.next_visit_date && v.next_visit_date < today) overdueSet.add(v.enrollment_id);
  });

  els.enrollmentsList.innerHTML = enrollments.map(e => {
    const pat = patients.find(p => p.id === e.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    const overdue = overdueSet.has(e.id);
    return `
      <div class="patient-row" data-id="${e.id}">
        <div>
          <div class="pr-name">${name} ${overdue ? `<span class="med-status med-status-stopped" style="background:#FBEAE8;color:var(--danger);">overdue</span>` : ''}</div>
          <div class="pr-meta">${e.program} · enrolled ${e.enrollment_date}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.enrollmentsList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderEnrollmentDetail(row.dataset.id));
  });
}

// ---------- Enrollment detail: visits ----------
async function renderEnrollmentDetail(enrollId) {
  const e = enrollments.find(x => x.id === enrollId);
  if (!e) return;
  const pat = patients.find(p => p.id === e.patient_id);
  const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';

  els.enrollmentsList.innerHTML = `
    <div class="vitals-form">
      <button class="btn-ghost btn-small" id="back-to-cd-list">← Back to list</button>
      <h3 style="margin-top:10px;">${name}</h3>
      <div class="med-meta">${e.program} · enrolled ${e.enrollment_date}</div>
      ${e.notes ? `<div class="consult-text">${e.notes}</div>` : ''}

      <div class="vitals-head" style="margin-top:16px;"><h4>Follow-up visits</h4></div>
      <div id="cd-visits-list"><p class="empty-state small">Loading…</p></div>
      <button class="btn-ghost btn-small" id="add-cd-visit-btn" style="margin-top:8px;">+ Add visit</button>
      <div id="cd-visit-form-area"></div>

      <div class="vitals-head" style="margin-top:16px;"><h4>Status</h4></div>
      <div class="form-actions" style="justify-content:flex-start; gap:8px;">
        <button type="button" class="btn-ghost btn-small" id="mark-defaulted-btn">Mark defaulted</button>
        <button type="button" class="btn-ghost btn-small" id="mark-completed-btn">Mark completed</button>
      </div>
      <p class="form-status" id="cd-status-msg"></p>
    </div>
  `;

  document.getElementById('back-to-cd-list').addEventListener('click', loadEnrollments);
  document.getElementById('add-cd-visit-btn').addEventListener('click', () => renderCdVisitForm(e));
  document.getElementById('mark-defaulted-btn').addEventListener('click', () => updateEnrollmentStatus(e.id, 'defaulted'));
  document.getElementById('mark-completed-btn').addEventListener('click', () => updateEnrollmentStatus(e.id, 'completed'));

  await loadCdVisits(e.id);
}

async function loadCdVisits(enrollId) {
  const el = document.getElementById('cd-visits-list');
  const { data, error } = await client
    .from('chronic_visits')
    .select('*')
    .eq('enrollment_id', enrollId)
    .order('visit_date', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="empty-state small">Couldn't load visits.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state small">No visits recorded yet.</p>`;
    return;
  }

  el.innerHTML = data.map(v => `
    <div class="med-entry">
      <div class="med-meta">${v.visit_date}${v.next_visit_date ? ` · Next: ${v.next_visit_date}` : ''}</div>
      <div class="vitals-grid" style="margin-top:6px;">
        ${v.weight_kg ? `<span class="vitals-chip">Wt ${v.weight_kg}kg</span>` : ''}
        ${v.key_result ? `<span class="vitals-chip">${v.key_result}</span>` : ''}
        ${v.adherence ? `<span class="vitals-chip${v.adherence === 'Poor' ? ' vital-flag' : ''}">Adherence: ${v.adherence}</span>` : ''}
      </div>
      ${v.findings ? `<div class="consult-text" style="margin-top:6px;">${v.findings}</div>` : ''}
    </div>
  `).join('');
}

function renderCdVisitForm(enrollment) {
  const area = document.getElementById('cd-visit-form-area');
  area.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Visit date</label><input type="date" id="cd-visit-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="edit-field"><label>Weight (kg)</label><input type="number" step="0.1" id="cd-visit-weight"></div>
        <div class="edit-field"><label>Key result</label><input id="cd-visit-key" placeholder="e.g. Viral load, HbA1c, BP, Sputum"></div>
        <div class="edit-field"><label>Adherence</label>
          <select id="cd-visit-adherence"><option>Good</option><option>Fair</option><option>Poor</option></select>
        </div>
      </div>
      <div class="edit-field"><label>Findings</label><textarea id="cd-visit-findings" rows="2"></textarea></div>
      <div class="edit-field"><label>Next visit date</label><input type="date" id="cd-visit-next"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-cd-visit-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-cd-visit-btn">Save visit</button>
      </div>
      <p class="form-status" id="cd-visit-status"></p>
    </div>
  `;

  document.getElementById('cancel-cd-visit-btn').addEventListener('click', () => area.innerHTML = '');
  document.getElementById('save-cd-visit-btn').addEventListener('click', () => saveCdVisit(enrollment));
}

async function saveCdVisit(enrollment) {
  const statusEl = document.getElementById('cd-visit-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error } = await client.from('chronic_visits').insert([{
    enrollment_id: enrollment.id,
    visit_date: document.getElementById('cd-visit-date').value || null,
    weight_kg: Number(document.getElementById('cd-visit-weight').value) || null,
    key_result: document.getElementById('cd-visit-key').value.trim(),
    adherence: document.getElementById('cd-visit-adherence').value,
    findings: document.getElementById('cd-visit-findings').value.trim(),
    next_visit_date: document.getElementById('cd-visit-next').value || null,
  }]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  document.getElementById('cd-visit-form-area').innerHTML = '';
  await loadCdVisits(enrollment.id);
}

async function updateEnrollmentStatus(enrollId, status) {
  const statusEl = document.getElementById('cd-status-msg');
  statusEl.textContent = 'Updating…';
  statusEl.className = 'form-status';

  const { error } = await client.from('chronic_enrollments').update({ status }).eq('id', enrollId);

  if (error) {
    statusEl.textContent = `Couldn't update: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadEnrollments();
}

// ---------- Sign out ----------
document.getElementById('signout-btn').addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.href = 'login.html';
});

// ---------- Init ----------
(async function init() {
  const user = await window.authReady;
  const userLabel = document.getElementById('user-email');
  if (userLabel && user) userLabel.textContent = user.email;

  await checkConnection();
  await loadPatients();
  await loadEnrollments();
})();
