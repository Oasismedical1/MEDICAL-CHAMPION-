// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('mnch-patient-search'),
  patientResults: document.getElementById('mnch-patient-results'),
  patientIdField: document.getElementById('mnch-patient-id'),
  selectedPatientLabel: document.getElementById('mnch-selected-patient'),
  lmp: document.getElementById('mnch-lmp'),
  edd: document.getElementById('mnch-edd'),
  gravida: document.getElementById('mnch-gravida'),
  para: document.getElementById('mnch-para'),
  registerBtn: document.getElementById('register-preg-btn'),
  registerStatus: document.getElementById('register-preg-status'),
  pregnanciesList: document.getElementById('pregnancies-list'),
};

let patients = [];
let pregnancies = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('pregnancies').select('id').limit(1);
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

// ---------- EDD calculation ----------
function calcEdd(lmpStr) {
  const lmp = new Date(lmpStr);
  const edd = new Date(lmp.getTime() + 280 * 86400000); // 40 weeks
  return edd;
}

els.lmp.addEventListener('change', () => {
  if (!els.lmp.value) { els.edd.value = ''; return; }
  els.edd.value = calcEdd(els.lmp.value).toLocaleDateString();
});

function gestationalWeeks(lmpStr) {
  const lmp = new Date(lmpStr);
  const days = Math.floor((Date.now() - lmp) / 86400000);
  return Math.floor(days / 7);
}

// ---------- Register pregnancy ----------
els.registerBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  if (!patientId) {
    els.registerStatus.textContent = 'Select a patient first.';
    els.registerStatus.className = 'form-status err';
    return;
  }
  if (!els.lmp.value) {
    els.registerStatus.textContent = 'Enter the LMP date.';
    els.registerStatus.className = 'form-status err';
    return;
  }

  els.registerStatus.textContent = 'Saving…';
  els.registerStatus.className = 'form-status';

  const edd = calcEdd(els.lmp.value).toISOString().slice(0, 10);

  const { error } = await client.from('pregnancies').insert([{
    patient_id: patientId,
    lmp_date: els.lmp.value,
    edd,
    gravida: Number(els.gravida.value) || null,
    para: Number(els.para.value) || null,
  }]);

  if (error) {
    els.registerStatus.textContent = `Couldn't save: ${error.message}`;
    els.registerStatus.className = 'form-status err';
    return;
  }

  els.registerStatus.textContent = 'Pregnancy registered.';
  els.registerStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.lmp.value = '';
  els.edd.value = '';
  els.gravida.value = '';
  els.para.value = '';

  await loadPregnancies();
});

// ---------- Active pregnancies ----------
async function loadPregnancies() {
  const { data, error } = await client
    .from('pregnancies')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    els.pregnanciesList.innerHTML = `<p class="empty-state">Couldn't load pregnancies.</p>`;
    return;
  }
  pregnancies = data || [];

  if (!pregnancies.length) {
    els.pregnanciesList.innerHTML = `<p class="empty-state">No active pregnancies.</p>`;
    return;
  }

  els.pregnanciesList.innerHTML = pregnancies.map(preg => {
    const pat = patients.find(p => p.id === preg.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    const weeks = gestationalWeeks(preg.lmp_date);
    return `
      <div class="patient-row" data-id="${preg.id}">
        <div>
          <div class="pr-name">${name}</div>
          <div class="pr-meta">${weeks} weeks · EDD ${new Date(preg.edd).toLocaleDateString()} · G${preg.gravida || '?'}P${preg.para ?? '?'}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.pregnanciesList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderPregnancyDetail(row.dataset.id));
  });
}

// ---------- Pregnancy detail: ANC + delivery ----------
async function renderPregnancyDetail(pregId) {
  const preg = pregnancies.find(x => x.id === pregId);
  if (!preg) return;
  const pat = patients.find(p => p.id === preg.patient_id);
  const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';

  els.pregnanciesList.innerHTML = `
    <div class="vitals-form">
      <button class="btn-ghost btn-small" id="back-to-preg-list">← Back to list</button>
      <h3 style="margin-top:10px;">${name}</h3>
      <div class="med-meta">${gestationalWeeks(preg.lmp_date)} weeks · EDD ${new Date(preg.edd).toLocaleDateString()} · G${preg.gravida || '?'}P${preg.para ?? '?'}</div>

      <div class="vitals-head" style="margin-top:16px;"><h4>ANC visits</h4></div>
      <div id="anc-list"><p class="empty-state small">Loading…</p></div>
      <button class="btn-ghost btn-small" id="add-anc-btn" style="margin-top:8px;">+ Add ANC visit</button>
      <div id="anc-form-area"></div>

      <div class="vitals-head" style="margin-top:16px;"><h4>Delivery</h4></div>
      <div id="delivery-area"></div>
    </div>
  `;

  document.getElementById('back-to-preg-list').addEventListener('click', loadPregnancies);
  document.getElementById('add-anc-btn').addEventListener('click', () => renderAncForm(preg));

  await loadAncVisits(preg.id);
  await renderDeliveryArea(preg);
}

async function loadAncVisits(pregId) {
  const el = document.getElementById('anc-list');
  const { data, error } = await client
    .from('anc_visits')
    .select('*')
    .eq('pregnancy_id', pregId)
    .order('visit_date', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="empty-state small">Couldn't load ANC visits.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state small">No ANC visits recorded yet.</p>`;
    return;
  }

  el.innerHTML = data.map(v => `
    <div class="med-entry">
      <div class="med-meta">${v.visit_date} · ${v.gestational_age_weeks ? `${v.gestational_age_weeks} wks` : ''}</div>
      <div class="vitals-grid" style="margin-top:6px;">
        ${v.weight_kg ? `<span class="vitals-chip">Wt ${v.weight_kg}kg</span>` : ''}
        ${v.bp_systolic ? `<span class="vitals-chip">BP ${v.bp_systolic}/${v.bp_diastolic ?? '—'}</span>` : ''}
        ${v.fundal_height ? `<span class="vitals-chip">FH ${v.fundal_height}cm</span>` : ''}
        ${v.fetal_heart_rate ? `<span class="vitals-chip">FHR ${v.fetal_heart_rate}</span>` : ''}
      </div>
      ${v.findings ? `<div class="consult-text" style="margin-top:6px;">${v.findings}</div>` : ''}
    </div>
  `).join('');
}

function renderAncForm(preg) {
  const area = document.getElementById('anc-form-area');
  area.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Visit date</label><input type="date" id="anc-date" value="${new Date().toISOString().slice(0,10)}"></div>
        <div class="edit-field"><label>Gestational age (weeks)</label><input type="number" id="anc-weeks" value="${gestationalWeeks(preg.lmp_date)}"></div>
        <div class="edit-field"><label>Weight (kg)</label><input type="number" step="0.1" id="anc-weight"></div>
        <div class="edit-field"><label>BP systolic / diastolic</label>
          <div style="display:flex; gap:6px;"><input type="number" id="anc-bps" placeholder="Sys"><input type="number" id="anc-bpd" placeholder="Dia"></div>
        </div>
        <div class="edit-field"><label>Fundal height (cm)</label><input type="number" id="anc-fh"></div>
        <div class="edit-field"><label>Fetal heart rate</label><input type="number" id="anc-fhr"></div>
      </div>
      <div class="edit-field"><label>Findings</label><textarea id="anc-findings" rows="2"></textarea></div>
      <div class="edit-field"><label>Next visit date</label><input type="date" id="anc-next"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-anc-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-anc-btn">Save visit</button>
      </div>
      <p class="form-status" id="anc-status"></p>
    </div>
  `;

  document.getElementById('cancel-anc-btn').addEventListener('click', () => area.innerHTML = '');
  document.getElementById('save-anc-btn').addEventListener('click', () => saveAncVisit(preg));
}

async function saveAncVisit(preg) {
  const statusEl = document.getElementById('anc-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const num = (id) => { const v = document.getElementById(id).value; return v === '' ? null : Number(v); };

  const { error } = await client.from('anc_visits').insert([{
    pregnancy_id: preg.id,
    visit_date: document.getElementById('anc-date').value || null,
    gestational_age_weeks: num('anc-weeks'),
    weight_kg: num('anc-weight'),
    bp_systolic: num('anc-bps'),
    bp_diastolic: num('anc-bpd'),
    fundal_height: num('anc-fh'),
    fetal_heart_rate: num('anc-fhr'),
    findings: document.getElementById('anc-findings').value.trim(),
    next_visit_date: document.getElementById('anc-next').value || null,
  }]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  document.getElementById('anc-form-area').innerHTML = '';
  await loadAncVisits(preg.id);
}

// ---------- Delivery & PNC ----------
async function renderDeliveryArea(preg) {
  const area = document.getElementById('delivery-area');

  const { data: existing } = await client
    .from('deliveries')
    .select('*')
    .eq('pregnancy_id', preg.id)
    .limit(1);

  if (existing && existing.length) {
    const del = existing[0];
    area.innerHTML = `
      <div class="med-entry">
        <div class="med-meta">${new Date(del.delivery_date).toLocaleString()} · ${del.mode || ''} · ${del.outcome || ''}</div>
        ${del.birth_weight_kg ? `<div class="med-meta">Birth weight: ${del.birth_weight_kg}kg</div>` : ''}
        ${del.complications ? `<div class="med-meta">Complications: ${del.complications}</div>` : ''}
      </div>
      <div class="vitals-head" style="margin-top:12px;"><h4>PNC visits</h4></div>
      <div id="pnc-list"><p class="empty-state small">Loading…</p></div>
      <button class="btn-ghost btn-small" id="add-pnc-btn" style="margin-top:8px;">+ Add PNC visit</button>
      <div id="pnc-form-area"></div>
    `;
    document.getElementById('add-pnc-btn').addEventListener('click', () => renderPncForm(del.id));
    await loadPncVisits(del.id);
    return;
  }

  area.innerHTML = `<button class="btn-primary btn-small" id="record-delivery-btn">Record delivery</button><div id="delivery-form-area"></div>`;
  document.getElementById('record-delivery-btn').addEventListener('click', () => renderDeliveryForm(preg));
}

function renderDeliveryForm(preg) {
  const area = document.getElementById('delivery-form-area');
  area.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Mode</label>
          <select id="del-mode"><option>Vaginal</option><option>Caesarean Section</option><option>Assisted</option></select>
        </div>
        <div class="edit-field"><label>Outcome</label>
          <select id="del-outcome"><option>Live birth</option><option>Stillbirth</option></select>
        </div>
        <div class="edit-field"><label>Birth weight (kg)</label><input type="number" step="0.1" id="del-weight"></div>
        <div class="edit-field"><label>Attendant</label><input id="del-attendant"></div>
      </div>
      <div class="edit-field"><label>Complications</label><textarea id="del-complications" rows="2"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-del-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-del-btn">Save delivery</button>
      </div>
      <p class="form-status" id="del-status"></p>
    </div>
  `;
  document.getElementById('cancel-del-btn').addEventListener('click', () => area.innerHTML = '');
  document.getElementById('save-del-btn').addEventListener('click', () => saveDelivery(preg));
}

async function saveDelivery(preg) {
  const statusEl = document.getElementById('del-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error: delErr } = await client.from('deliveries').insert([{
    pregnancy_id: preg.id,
    mode: document.getElementById('del-mode').value,
    outcome: document.getElementById('del-outcome').value,
    birth_weight_kg: Number(document.getElementById('del-weight').value) || null,
    attendant: document.getElementById('del-attendant').value.trim(),
    complications: document.getElementById('del-complications').value.trim(),
  }]);

  if (delErr) {
    statusEl.textContent = `Couldn't save: ${delErr.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await client.from('pregnancies').update({ status: 'delivered' }).eq('id', preg.id);
  await renderDeliveryArea(preg);
}

async function loadPncVisits(deliveryId) {
  const el = document.getElementById('pnc-list');
  const { data, error } = await client
    .from('pnc_visits')
    .select('*')
    .eq('delivery_id', deliveryId)
    .order('visit_date', { ascending: false });

  if (error) {
    el.innerHTML = `<p class="empty-state small">Couldn't load PNC visits.</p>`;
    return;
  }
  if (!data.length) {
    el.innerHTML = `<p class="empty-state small">No PNC visits recorded yet.</p>`;
    return;
  }

  el.innerHTML = data.map(v => `
    <div class="med-entry">
      <div class="med-meta">${v.visit_date}</div>
      ${v.mother_findings ? `<div class="consult-text">Mother: ${v.mother_findings}</div>` : ''}
      ${v.baby_findings ? `<div class="consult-text">Baby: ${v.baby_findings}</div>` : ''}
    </div>
  `).join('');
}

function renderPncForm(deliveryId) {
  const area = document.getElementById('pnc-form-area');
  area.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Visit date</label><input type="date" id="pnc-date" value="${new Date().toISOString().slice(0,10)}"></div>
      <div class="edit-field"><label>Mother findings</label><textarea id="pnc-mother" rows="2"></textarea></div>
      <div class="edit-field"><label>Baby findings</label><textarea id="pnc-baby" rows="2"></textarea></div>
      <div class="edit-field"><label>Next visit date</label><input type="date" id="pnc-next"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-pnc-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-pnc-btn">Save PNC visit</button>
      </div>
      <p class="form-status" id="pnc-status"></p>
    </div>
  `;
  document.getElementById('cancel-pnc-btn').addEventListener('click', () => area.innerHTML = '');
  document.getElementById('save-pnc-btn').addEventListener('click', () => savePncVisit(deliveryId));
}

async function savePncVisit(deliveryId) {
  const statusEl = document.getElementById('pnc-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error } = await client.from('pnc_visits').insert([{
    delivery_id: deliveryId,
    visit_date: document.getElementById('pnc-date').value || null,
    mother_findings: document.getElementById('pnc-mother').value.trim(),
    baby_findings: document.getElementById('pnc-baby').value.trim(),
    next_visit_date: document.getElementById('pnc-next').value || null,
  }]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  document.getElementById('pnc-form-area').innerHTML = '';
  await loadPncVisits(deliveryId);
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
  await loadPregnancies();
})();
