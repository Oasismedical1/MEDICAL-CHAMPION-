// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('adm-patient-search'),
  patientResults: document.getElementById('adm-patient-results'),
  patientIdField: document.getElementById('adm-patient-id'),
  selectedPatientLabel: document.getElementById('adm-selected-patient'),
  ward: document.getElementById('adm-ward'),
  bed: document.getElementById('adm-bed'),
  diagnosis: document.getElementById('adm-diagnosis'),
  admitBtn: document.getElementById('admit-btn'),
  admitStatus: document.getElementById('admit-status'),
  inpatientList: document.getElementById('inpatient-list'),
};

let patients = [];
let admissions = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('admissions').select('id').limit(1);
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

// ---------- Admit ----------
els.admitBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  if (!patientId) {
    els.admitStatus.textContent = 'Select a patient first.';
    els.admitStatus.className = 'form-status err';
    return;
  }

  els.admitStatus.textContent = 'Admitting…';
  els.admitStatus.className = 'form-status';

  const { error } = await client.from('admissions').insert([{
    patient_id: patientId,
    ward: els.ward.value.trim(),
    bed_number: els.bed.value.trim(),
    admitting_diagnosis: els.diagnosis.value.trim(),
  }]);

  if (error) {
    els.admitStatus.textContent = `Couldn't admit: ${error.message}`;
    els.admitStatus.className = 'form-status err';
    return;
  }

  els.admitStatus.textContent = 'Patient admitted.';
  els.admitStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.ward.value = '';
  els.bed.value = '';
  els.diagnosis.value = '';

  await loadInpatients();
});

// ---------- Current inpatients ----------
async function loadInpatients() {
  const { data, error } = await client
    .from('admissions')
    .select('*')
    .eq('status', 'admitted')
    .order('admission_date', { ascending: false });

  if (error) {
    els.inpatientList.innerHTML = `<p class="empty-state">Couldn't load inpatients.</p>`;
    return;
  }
  admissions = data || [];

  if (!admissions.length) {
    els.inpatientList.innerHTML = `<p class="empty-state">No patients currently admitted.</p>`;
    return;
  }

  els.inpatientList.innerHTML = admissions.map(a => {
    const pat = patients.find(p => p.id === a.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    const days = Math.floor((Date.now() - new Date(a.admission_date)) / 86400000);
    return `
      <div class="patient-row" data-id="${a.id}">
        <div>
          <div class="pr-name">${name}</div>
          <div class="pr-meta">${a.ward || 'Ward n/a'}${a.bed_number ? ` · Bed ${a.bed_number}` : ''} · Day ${days + 1}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.inpatientList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderAdmissionDetail(row.dataset.id));
  });
}

// ---------- Admission detail: notes + discharge ----------
async function renderAdmissionDetail(admissionId) {
  const a = admissions.find(x => x.id === admissionId);
  if (!a) return;
  const pat = patients.find(p => p.id === a.patient_id);
  const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';

  els.inpatientList.innerHTML = `
    <div class="vitals-form">
      <button class="btn-ghost btn-small" id="back-to-list-btn">← Back to list</button>
      <h3 style="margin-top:10px;">${name}</h3>
      <div class="med-meta">${a.ward || 'Ward n/a'}${a.bed_number ? ` · Bed ${a.bed_number}` : ''}</div>
      <div class="med-meta">Admitted: ${new Date(a.admission_date).toLocaleString()}</div>
      ${a.admitting_diagnosis ? `<div class="med-meta">Diagnosis: ${a.admitting_diagnosis}</div>` : ''}

      <div class="vitals-head" style="margin-top:16px;">
        <h4>Ward notes</h4>
      </div>
      <div id="ward-notes-list"><p class="empty-state small">Loading…</p></div>
      <div class="edit-field" style="margin-top:10px;"><label>Add note</label><textarea id="new-note" rows="2"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="save-note-btn">Add note</button>
      </div>
      <p class="form-status" id="note-status"></p>

      <div class="vitals-head" style="margin-top:16px;">
        <h4>Discharge</h4>
      </div>
      <div class="edit-field"><label>Discharge summary</label><textarea id="discharge-summary" rows="2"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="discharge-btn">Discharge patient</button>
      </div>
      <p class="form-status" id="discharge-status"></p>
    </div>
  `;

  document.getElementById('back-to-list-btn').addEventListener('click', loadInpatients);
  document.getElementById('save-note-btn').addEventListener('click', () => saveWardNote(admissionId));
  document.getElementById('discharge-btn').addEventListener('click', () => dischargePatient(admissionId));

  await loadWardNotes(admissionId);
}

async function loadWardNotes(admissionId) {
  const el = document.getElementById('ward-notes-list');
  const { data, error } = await client
    .from('ward_notes')
    .select('*')
    .eq('admission_id', admissionId)
    .order('recorded_at', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="empty-state small">Couldn't load notes.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state small">No notes yet.</p>`;
    return;
  }

  el.innerHTML = data.map(n => `
    <div class="med-entry">
      <div class="med-meta">${new Date(n.recorded_at).toLocaleString()}</div>
      <div class="consult-text">${n.note}</div>
    </div>
  `).join('');
}

async function saveWardNote(admissionId) {
  const statusEl = document.getElementById('note-status');
  const note = document.getElementById('new-note').value.trim();
  if (!note) {
    statusEl.textContent = 'Write a note first.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error } = await client.from('ward_notes').insert([{ admission_id: admissionId, note }]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  document.getElementById('new-note').value = '';
  statusEl.textContent = '';
  await loadWardNotes(admissionId);
}

async function dischargePatient(admissionId) {
  const statusEl = document.getElementById('discharge-status');
  statusEl.textContent = 'Discharging…';
  statusEl.className = 'form-status';

  const { error } = await client.from('admissions').update({
    status: 'discharged',
    discharge_date: new Date().toISOString(),
    discharge_summary: document.getElementById('discharge-summary').value.trim(),
  }).eq('id', admissionId);

  if (error) {
    statusEl.textContent = `Couldn't discharge: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadInpatients();
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
  await loadInpatients();
})();
