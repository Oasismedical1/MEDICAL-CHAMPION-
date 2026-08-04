// `client` is created by auth-guard.js, which loads before this file.

const els = {
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
  patientSearch: document.getElementById('lab-patient-search'),
  patientResults: document.getElementById('lab-patient-results'),
  patientIdField: document.getElementById('lab-patient-id'),
  selectedPatientLabel: document.getElementById('lab-selected-patient'),
  testName: document.getElementById('lab-test-name'),
  sampleType: document.getElementById('lab-sample-type'),
  requestBtn: document.getElementById('lab-request-btn'),
  requestStatus: document.getElementById('lab-request-status'),
  pendingList: document.getElementById('lab-pending-list'),
  completedList: document.getElementById('lab-completed-list'),
};

let patients = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('lab_tests').select('id').limit(1);
  if (error) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Connection error';
    return false;
  }
  els.connDot.className = 'dot online';
  els.connLabel.textContent = 'Connected';
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

// ---------- Request a test ----------
els.requestBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  const testName = els.testName.value.trim();

  if (!patientId) {
    els.requestStatus.textContent = 'Select a patient first.';
    els.requestStatus.className = 'form-status err';
    return;
  }
  if (!testName) {
    els.requestStatus.textContent = 'Enter a test name.';
    els.requestStatus.className = 'form-status err';
    return;
  }

  els.requestStatus.textContent = 'Saving…';
  els.requestStatus.className = 'form-status';

  const { error } = await client.from('lab_tests').insert([{
    patient_id: patientId,
    test_name: testName,
    sample_type: els.sampleType.value.trim(),
  }]);

  if (error) {
    els.requestStatus.textContent = `Couldn't save: ${error.message}`;
    els.requestStatus.className = 'form-status err';
    return;
  }

  els.requestStatus.textContent = 'Test requested.';
  els.requestStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.testName.value = '';
  els.sampleType.value = '';

  await loadPendingList();
});

// ---------- Pending worklist ----------
async function loadPendingList() {
  const { data, error } = await client
    .from('lab_tests')
    .select('*')
    .neq('status', 'completed')
    .order('requested_at', { ascending: true });

  if (error) {
    els.pendingList.innerHTML = `<p class="empty-state">Couldn't load worklist.</p>`;
    return;
  }
  if (!data.length) {
    els.pendingList.innerHTML = `<p class="empty-state">No pending tests.</p>`;
    return;
  }

  els.pendingList.innerHTML = data.map(t => {
    const pat = patients.find(p => p.id === t.patient_id);
    return `
      <div class="patient-row" data-id="${t.id}" style="cursor:pointer;">
        <div>
          <div class="pr-name">${t.test_name}</div>
          <div class="pr-meta">${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'} · ${t.sample_type || 'sample n/a'} · ${new Date(t.requested_at).toLocaleDateString()}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.pendingList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderResultForm(row.dataset.id));
  });
}

function renderResultForm(testId) {
  const container = els.pendingList;
  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Result</label><input id="res-value" placeholder="e.g. Positive, 12.4 g/dL"></div>
      <div class="grid-2">
        <div class="edit-field"><label>Reference range</label><input id="res-range" placeholder="e.g. 12-16 g/dL"></div>
        <div class="edit-field"><label>Flag</label>
          <select id="res-flag">
            <option value="normal">Normal</option>
            <option value="abnormal">Abnormal</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-result-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-result-btn">Save result</button>
      </div>
      <p class="form-status" id="result-status"></p>
    </div>
  `;

  document.getElementById('cancel-result-btn').addEventListener('click', loadPendingList);
  document.getElementById('save-result-btn').addEventListener('click', () => saveResult(testId));
}

async function saveResult(testId) {
  const statusEl = document.getElementById('result-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error } = await client.from('lab_tests').update({
    result_value: document.getElementById('res-value').value.trim(),
    reference_range: document.getElementById('res-range').value.trim(),
    result_flag: document.getElementById('res-flag').value,
    status: 'completed',
    result_date: new Date().toISOString(),
  }).eq('id', testId);

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
    .from('lab_tests')
    .select('*')
    .eq('status', 'completed')
    .order('result_date', { ascending: false })
    .limit(15);

  if (error) {
    els.completedList.innerHTML = `<p class="empty-state">Couldn't load results.</p>`;
    return;
  }
  if (!data.length) {
    els.completedList.innerHTML = `<p class="empty-state">No completed tests yet.</p>`;
    return;
  }

  els.completedList.innerHTML = data.map(t => {
    const pat = patients.find(p => p.id === t.patient_id);
    const flagClass = t.result_flag === 'critical' ? 'vital-flag' : (t.result_flag === 'abnormal' ? 'vital-flag' : '');
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${t.test_name}${t.result_value ? ` — ${t.result_value}` : ''}</div>
          <div class="med-meta">${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'} · ${new Date(t.result_date).toLocaleDateString()}</div>
        </div>
        <span class="vitals-chip${flagClass}">${t.result_flag || 'normal'}</span>
      </div>
    `;
  }).join('');
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
