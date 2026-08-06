// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('rad-patient-search'),
  patientResults: document.getElementById('rad-patient-results'),
  patientIdField: document.getElementById('rad-patient-id'),
  selectedPatientLabel: document.getElementById('rad-selected-patient'),
  examType: document.getElementById('rad-exam-type'),
  indication: document.getElementById('rad-indication'),
  requestBtn: document.getElementById('rad-request-btn'),
  requestStatus: document.getElementById('rad-request-status'),
  pendingList: document.getElementById('rad-pending-list'),
  completedList: document.getElementById('rad-completed-list'),
};

let patients = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('radiology_orders').select('id').limit(1);
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

// ---------- Request an exam ----------
els.requestBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  if (!patientId) {
    els.requestStatus.textContent = 'Select a patient first.';
    els.requestStatus.className = 'form-status err';
    return;
  }

  els.requestStatus.textContent = 'Saving…';
  els.requestStatus.className = 'form-status';

  const { error } = await client.from('radiology_orders').insert([{
    patient_id: patientId,
    exam_type: els.examType.value,
    clinical_indication: els.indication.value.trim(),
  }]);

  if (error) {
    els.requestStatus.textContent = `Couldn't save: ${error.message}`;
    els.requestStatus.className = 'form-status err';
    return;
  }

  els.requestStatus.textContent = 'Exam requested.';
  els.requestStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.indication.value = '';

  await loadPendingList();
});

// ---------- Pending worklist ----------
async function loadPendingList() {
  const { data, error } = await client
    .from('radiology_orders')
    .select('*')
    .neq('status', 'completed')
    .order('requested_at', { ascending: true });

  if (error) {
    els.pendingList.innerHTML = `<p class="empty-state">Couldn't load worklist.</p>`;
    return;
  }
  if (!data.length) {
    els.pendingList.innerHTML = `<p class="empty-state">No pending exams.</p>`;
    return;
  }

  els.pendingList.innerHTML = data.map(o => {
    const pat = patients.find(p => p.id === o.patient_id);
    return `
      <div class="patient-row" data-id="${o.id}" style="cursor:pointer;">
        <div>
          <div class="pr-name">${o.exam_type}</div>
          <div class="pr-meta">${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'} · ${o.clinical_indication || 'no indication given'} · ${new Date(o.requested_at).toLocaleDateString()}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.pendingList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderReportForm(row.dataset.id));
  });
}

function renderReportForm(orderId) {
  const container = els.pendingList;
  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Report</label><textarea id="rep-text" rows="4" placeholder="Findings…"></textarea></div>
      <div class="edit-field"><label>Impression</label><textarea id="rep-impression" rows="2"></textarea></div>
      <div class="edit-field"><label>Image (optional)</label><input type="file" id="rep-image" accept="image/*"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-report-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-report-btn">Save report</button>
      </div>
      <p class="form-status" id="report-status"></p>
    </div>
  `;

  document.getElementById('cancel-report-btn').addEventListener('click', loadPendingList);
  document.getElementById('save-report-btn').addEventListener('click', () => saveReport(orderId));
}

async function saveReport(orderId) {
  const statusEl = document.getElementById('report-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  let imagePath = null;
  const file = document.getElementById('rep-image').files[0];
  if (file) {
    imagePath = `radiology/${orderId}/${Date.now()}-${file.name}`;
    const { error: uploadErr } = await client.storage.from('patient-files').upload(imagePath, file);
    if (uploadErr) {
      statusEl.textContent = `Couldn't upload image: ${uploadErr.message}`;
      statusEl.className = 'form-status err';
      return;
    }
  }

  const { error } = await client.from('radiology_orders').update({
    report_text: document.getElementById('rep-text').value.trim(),
    impression: document.getElementById('rep-impression').value.trim(),
    image_path: imagePath,
    status: 'completed',
    reported_at: new Date().toISOString(),
  }).eq('id', orderId);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadPendingList();
  await loadCompletedList();
}

// ---------- Recently completed ----------
async function loadCompletedList() {
  const { data, error } = await client
    .from('radiology_orders')
    .select('*')
    .eq('status', 'completed')
    .order('reported_at', { ascending: false })
    .limit(15);

  if (error) {
    els.completedList.innerHTML = `<p class="empty-state">Couldn't load reports.</p>`;
    return;
  }
  if (!data.length) {
    els.completedList.innerHTML = `<p class="empty-state">No completed exams yet.</p>`;
    return;
  }

  els.completedList.innerHTML = data.map(o => {
    const pat = patients.find(p => p.id === o.patient_id);
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${o.exam_type} — ${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'}</div>
          <div class="med-meta">${o.impression || o.report_text || 'No findings recorded'} · ${new Date(o.reported_at).toLocaleDateString()}</div>
        </div>
        ${o.image_path ? `<button class="btn-ghost btn-small view-image-btn" data-path="${o.image_path}">View</button>` : ''}
      </div>
    `;
  }).join('');

  els.completedList.querySelectorAll('.view-image-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data, error } = await client.storage.from('patient-files').createSignedUrl(btn.dataset.path, 300);
      if (!error && data) window.open(data.signedUrl, '_blank');
    });
  });
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
  await loadPendingList();
  await loadCompletedList();
})();
