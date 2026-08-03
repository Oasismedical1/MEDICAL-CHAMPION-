// ---------- Setup ----------
// `client` is created by auth-guard.js, which loads before this file.

const els = {
  form: document.getElementById('patient-form'),
  status: document.getElementById('form-status'),
  upiPreview: document.getElementById('upi-preview'),
  list: document.getElementById('patient-list'),
  search: document.getElementById('search'),
  count: document.getElementById('patient-count'),
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
  drawer: document.getElementById('drawer'),
  drawerContent: document.getElementById('drawer-content'),
  drawerClose: document.getElementById('drawer-close'),
  resetBtn: document.getElementById('reset-btn'),
};

let allPatients = [];

// ---------- UPI generation: UGM-<DISTRICT3>-<YEAR>-<SEQ> ----------
function districtCode(district) {
  return (district || 'SRT').trim().slice(0, 3).toUpperCase() || 'SRT';
}

function nextUpi(count, district) {
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(6, '0');
  return `UGM-${districtCode(district)}-${year}-${seq}`;
}

// ---------- Connection check ----------
async function checkConnection() {
  if (SUPABASE_URL.includes('YOUR_SUPABASE')) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Not connected — edit config.js';
    return false;
  }
  const { error } = await client.from('patients').select('id').limit(1);
  if (error) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Connection error — check config.js';
    return false;
  }
  els.connDot.className = 'dot online';
  els.connLabel.textContent = 'Connected';
  return true;
}

// ---------- Load & render patients ----------
async function loadPatients() {
  const { data, error } = await client
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    els.list.innerHTML = `<p class="empty-state">Couldn't load patients. Check your Supabase connection in config.js.</p>`;
    return;
  }

  allPatients = data || [];
  els.count.textContent = allPatients.length;
  els.upiPreview.textContent = nextUpi(allPatients.length, document.getElementById('district').value);
  renderList(allPatients);
}

function renderList(patients) {
  if (!patients.length) {
    els.list.innerHTML = `<p class="empty-state">No patients yet. The first registration will appear here.</p>`;
    return;
  }
  els.list.innerHTML = patients.map(p => `
    <div class="patient-row" data-id="${p.id}">
      <div>
        <div class="pr-name">${p.first_name} ${p.surname}</div>
        <div class="pr-meta">${p.upi} · ${p.sex || '—'} · ${p.phone || 'no phone'}</div>
      </div>
      <span>→</span>
    </div>
  `).join('');

  els.list.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => openDrawer(row.dataset.id));
  });
}

// ---------- Search ----------
els.search.addEventListener('input', () => {
  const q = els.search.value.trim().toLowerCase();
  if (!q) return renderList(allPatients);
  const filtered = allPatients.filter(p =>
    `${p.first_name} ${p.surname}`.toLowerCase().includes(q) ||
    (p.upi || '').toLowerCase().includes(q) ||
    (p.phone || '').includes(q)
  );
  renderList(filtered);
});

// ---------- Register patient ----------
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.status.textContent = 'Saving…';
  els.status.className = 'form-status';

  const record = {
    upi: nextUpi(allPatients.length, document.getElementById('district').value),
    first_name: val('first_name'),
    middle_name: val('middle_name'),
    surname: val('surname'),
    sex: val('sex'),
    dob: val('dob') || null,
    nin: val('nin'),
    phone: val('phone'),
    village: val('village'),
    subcounty: val('subcounty'),
    district: val('district'),
    ec_name: val('ec_name'),
    ec_phone: val('ec_phone'),
    blood_group: val('blood_group'),
    allergies: val('allergies'),
    chronic_conditions: val('chronic'),
  };

  const { error } = await client.from('patients').insert([record]);

  if (error) {
    els.status.textContent = `Couldn't save: ${error.message}`;
    els.status.className = 'form-status err';
    return;
  }

  els.status.textContent = `Registered — UPI ${record.upi}`;
  els.status.className = 'form-status ok';
  els.form.reset();
  document.getElementById('district').value = 'Soroti';
  loadPatients();
});

els.resetBtn.addEventListener('click', () => {
  els.form.reset();
  document.getElementById('district').value = 'Soroti';
  els.status.textContent = '';
});

function val(id) {
  return document.getElementById(id).value.trim();
}

// ---------- Detail drawer ----------
function openDrawer(id) {
  const p = allPatients.find(x => String(x.id) === String(id));
  if (!p) return;
  renderDrawerView(p);
  els.drawer.classList.add('open');
}

function renderDrawerView(p) {
  const allergyTag = p.allergies
    ? `<span class="tag-danger">⚠ Allergy: ${p.allergies}</span>`
    : '';

  els.drawerContent.innerHTML = `
    <div class="drawer-head">
      <div>
        <h3>${p.first_name} ${p.middle_name || ''} ${p.surname}</h3>
        <div class="drawer-upi">${p.upi}</div>
      </div>
      <button class="btn-ghost btn-small" id="edit-btn">Edit</button>
    </div>
    ${allergyTag}
    <dl>
      <dt>Sex / DOB</dt><dd>${p.sex || '—'} · ${p.dob || 'not recorded'}</dd>
      <dt>Phone</dt><dd>${p.phone || '—'}</dd>
      <dt>Location</dt><dd>${[p.village, p.subcounty, p.district].filter(Boolean).join(', ') || '—'}</dd>
      <dt>National ID</dt><dd>${p.nin || '—'}</dd>
      <dt>Emergency contact</dt><dd>${p.ec_name ? `${p.ec_name} (${p.ec_phone || 'no phone'})` : '—'}</dd>
      <dt>Blood group</dt><dd>${p.blood_group || 'Unknown'}</dd>
      <dt>Chronic conditions</dt><dd>${p.chronic_conditions || 'None recorded'}</dd>
      <dt>Registered</dt><dd>${new Date(p.created_at).toLocaleDateString()}</dd>
    </dl>

    <div class="vitals-head">
      <h4>Vitals</h4>
      <button class="btn-ghost btn-small" id="record-vitals-btn">+ Record</button>
    </div>
    <div id="vitals-list"><p class="empty-state small">Loading…</p></div>
  `;

  document.getElementById('edit-btn').addEventListener('click', () => renderDrawerEdit(p));
  document.getElementById('record-vitals-btn').addEventListener('click', () => renderVitalsForm(p));
  loadVitals(p);
}

// ---------- Vitals ----------
function flagVital(label, value, low, high) {
  if (value === null || value === undefined || value === '') return '';
  const v = Number(value);
  if (isNaN(v)) return '';
  return (v < low || v > high) ? ' vital-flag' : '';
}

async function loadVitals(p) {
  const listEl = document.getElementById('vitals-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('vitals')
    .select('*')
    .eq('patient_id', p.id)
    .order('recorded_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load vitals.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No vitals recorded yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(v => `
    <div class="vitals-entry">
      <div class="vitals-date">${new Date(v.recorded_at).toLocaleString()}</div>
      <div class="vitals-grid">
        ${v.temperature != null ? `<span class="vitals-chip${flagVital('temp', v.temperature, 35.5, 37.5)}">Temp ${v.temperature}°C</span>` : ''}
        ${v.bp_systolic != null ? `<span class="vitals-chip${flagVital('bp', v.bp_systolic, 90, 140)}">BP ${v.bp_systolic}/${v.bp_diastolic ?? '—'}</span>` : ''}
        ${v.pulse != null ? `<span class="vitals-chip${flagVital('pulse', v.pulse, 60, 100)}">Pulse ${v.pulse}</span>` : ''}
        ${v.respiratory_rate != null ? `<span class="vitals-chip${flagVital('rr', v.respiratory_rate, 12, 20)}">RR ${v.respiratory_rate}</span>` : ''}
        ${v.spo2 != null ? `<span class="vitals-chip${flagVital('spo2', v.spo2, 94, 100)}">SpO₂ ${v.spo2}%</span>` : ''}
        ${v.weight_kg != null ? `<span class="vitals-chip">Wt ${v.weight_kg}kg</span>` : ''}
        ${v.height_cm != null ? `<span class="vitals-chip">Ht ${v.height_cm}cm</span>` : ''}
        ${v.blood_glucose != null ? `<span class="vitals-chip">Glucose ${v.blood_glucose}</span>` : ''}
        ${v.pain_score != null ? `<span class="vitals-chip">Pain ${v.pain_score}/10</span>` : ''}
      </div>
    </div>
  `).join('');
}

function renderVitalsForm(p) {
  const container = document.getElementById('vitals-list');
  if (!container) return;

  container.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Temperature (°C)</label><input type="number" step="0.1" id="v_temp"></div>
        <div class="edit-field"><label>Pulse (bpm)</label><input type="number" id="v_pulse"></div>
        <div class="edit-field"><label>BP systolic</label><input type="number" id="v_sys"></div>
        <div class="edit-field"><label>BP diastolic</label><input type="number" id="v_dia"></div>
        <div class="edit-field"><label>Respiratory rate</label><input type="number" id="v_rr"></div>
        <div class="edit-field"><label>SpO₂ (%)</label><input type="number" id="v_spo2"></div>
        <div class="edit-field"><label>Weight (kg)</label><input type="number" step="0.1" id="v_weight"></div>
        <div class="edit-field"><label>Height (cm)</label><input type="number" step="0.1" id="v_height"></div>
        <div class="edit-field"><label>Blood glucose</label><input type="number" step="0.1" id="v_glucose"></div>
        <div class="edit-field"><label>Pain score (0-10)</label><input type="number" min="0" max="10" id="v_pain"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-vitals-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-vitals-btn">Save vitals</button>
      </div>
      <p class="form-status" id="vitals-status"></p>
    </div>
  `;

  document.getElementById('cancel-vitals-btn').addEventListener('click', () => loadVitals(p));
  document.getElementById('save-vitals-btn').addEventListener('click', () => saveVitals(p));
}

async function saveVitals(p) {
  const statusEl = document.getElementById('vitals-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const num = (id) => {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  };

  const record = {
    patient_id: p.id,
    temperature: num('v_temp'),
    pulse: num('v_pulse'),
    bp_systolic: num('v_sys'),
    bp_diastolic: num('v_dia'),
    respiratory_rate: num('v_rr'),
    spo2: num('v_spo2'),
    weight_kg: num('v_weight'),
    height_cm: num('v_height'),
    blood_glucose: num('v_glucose'),
    pain_score: num('v_pain'),
  };

  const { error } = await client.from('vitals').insert([record]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadVitals(p);
}

function renderDrawerEdit(p) {
  els.drawerContent.innerHTML = `
    <h3>Edit patient</h3>
    <div class="drawer-upi">${p.upi}</div>

    <div class="edit-field"><label>First name</label><input id="e_first_name" value="${escAttr(p.first_name)}"></div>
    <div class="edit-field"><label>Middle name</label><input id="e_middle_name" value="${escAttr(p.middle_name)}"></div>
    <div class="edit-field"><label>Surname</label><input id="e_surname" value="${escAttr(p.surname)}"></div>
    <div class="edit-field"><label>Sex</label>
      <select id="e_sex">
        <option value="" ${!p.sex ? 'selected' : ''}>Select</option>
        <option ${p.sex === 'Female' ? 'selected' : ''}>Female</option>
        <option ${p.sex === 'Male' ? 'selected' : ''}>Male</option>
      </select>
    </div>
    <div class="edit-field"><label>Date of birth</label><input type="date" id="e_dob" value="${p.dob || ''}"></div>
    <div class="edit-field"><label>National ID</label><input id="e_nin" value="${escAttr(p.nin)}"></div>
    <div class="edit-field"><label>Phone</label><input id="e_phone" value="${escAttr(p.phone)}"></div>
    <div class="edit-field"><label>Village</label><input id="e_village" value="${escAttr(p.village)}"></div>
    <div class="edit-field"><label>Sub-county</label><input id="e_subcounty" value="${escAttr(p.subcounty)}"></div>
    <div class="edit-field"><label>District</label><input id="e_district" value="${escAttr(p.district)}"></div>
    <div class="edit-field"><label>Emergency contact name</label><input id="e_ec_name" value="${escAttr(p.ec_name)}"></div>
    <div class="edit-field"><label>Emergency contact phone</label><input id="e_ec_phone" value="${escAttr(p.ec_phone)}"></div>
    <div class="edit-field"><label>Blood group</label>
      <select id="e_blood_group">
        <option value="" ${!p.blood_group ? 'selected' : ''}>Unknown</option>
        ${['O+','O-','A+','A-','B+','B-','AB+','AB-'].map(bg =>
          `<option ${p.blood_group === bg ? 'selected' : ''}>${bg}</option>`).join('')}
      </select>
    </div>
    <div class="edit-field"><label>Known allergies</label><input id="e_allergies" value="${escAttr(p.allergies)}"></div>
    <div class="edit-field"><label>Chronic conditions</label><input id="e_chronic" value="${escAttr(p.chronic_conditions)}"></div>

    <div class="form-actions">
      <button type="button" class="btn-ghost" id="cancel-edit-btn">Cancel</button>
      <button type="button" class="btn-primary" id="save-edit-btn">Save changes</button>
    </div>
    <p class="form-status" id="edit-status"></p>
  `;

  document.getElementById('cancel-edit-btn').addEventListener('click', () => renderDrawerView(p));
  document.getElementById('save-edit-btn').addEventListener('click', () => saveEdit(p.id));
}

async function saveEdit(id) {
  const statusEl = document.getElementById('edit-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const updated = {
    first_name: ev('e_first_name'),
    middle_name: ev('e_middle_name'),
    surname: ev('e_surname'),
    sex: ev('e_sex'),
    dob: ev('e_dob') || null,
    nin: ev('e_nin'),
    phone: ev('e_phone'),
    village: ev('e_village'),
    subcounty: ev('e_subcounty'),
    district: ev('e_district'),
    ec_name: ev('e_ec_name'),
    ec_phone: ev('e_ec_phone'),
    blood_group: ev('e_blood_group'),
    allergies: ev('e_allergies'),
    chronic_conditions: ev('e_chronic'),
  };

  const { error } = await client.from('patients').update(updated).eq('id', id);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadPatients();
  const refreshed = allPatients.find(x => String(x.id) === String(id));
  if (refreshed) renderDrawerView(refreshed);
}

function ev(id) {
  return document.getElementById(id).value.trim();
}

function escAttr(v) {
  return (v || '').toString().replace(/"/g, '&quot;');
}

els.drawerClose.addEventListener('click', () => els.drawer.classList.remove('open'));

// ---------- Sign out ----------
const signOutBtn = document.getElementById('signout-btn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    await client.auth.signOut();
    window.location.href = 'login.html';
  });
}

// ---------- Init ----------
(async function init() {
  const user = await window.authReady; // waits for auth-guard.js to confirm login
  const userLabel = document.getElementById('user-email');
  if (userLabel && user) userLabel.textContent = user.email;

  const connected = await checkConnection();
  if (connected) await loadPatients();
  else els.upiPreview.textContent = nextUpi(0, 'Soroti');
})();
