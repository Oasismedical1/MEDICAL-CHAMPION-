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
    category: val('category'),
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
  document.getElementById('category').value = 'New Patient';
  loadPatients();
});

els.resetBtn.addEventListener('click', () => {
  els.form.reset();
  document.getElementById('district').value = 'Soroti';
  document.getElementById('category').value = 'New Patient';
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
      <div class="drawer-photo-row">
        <div class="patient-avatar" id="patient-avatar">${initials(p)}</div>
        <div>
          <h3>${p.first_name} ${p.middle_name || ''} ${p.surname}</h3>
          <div class="drawer-upi">${p.upi}</div>
          <button class="btn-ghost btn-small" id="photo-btn">Change photo</button>
          <input type="file" id="photo-input" accept="image/*" style="display:none">
        </div>
      </div>
      <button class="btn-ghost btn-small" id="edit-btn">Edit</button>
    </div>
    ${allergyTag}
    <dl>
      <dt>Category</dt><dd>${p.category || 'New Patient'}</dd>
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

    <div class="vitals-head">
      <h4>Clinical consultations</h4>
      <button class="btn-ghost btn-small" id="record-consult-btn">+ New</button>
    </div>
    <div id="consult-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Current medications</h4>
      <button class="btn-ghost btn-small" id="record-med-btn">+ Add</button>
    </div>
    <div id="med-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Documents</h4>
      <button class="btn-ghost btn-small" id="upload-doc-btn">+ Upload</button>
    </div>
    <div id="doc-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Immunization history</h4>
      <button class="btn-ghost btn-small" id="record-immun-btn">+ Add</button>
    </div>
    <div id="immun-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Family members</h4>
      <button class="btn-ghost btn-small" id="link-family-btn">+ Link</button>
    </div>
    <div id="family-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Lab results</h4>
    </div>
    <div id="lab-results-list"><p class="empty-state small">Loading…</p></div>

    <div class="vitals-head">
      <h4>Radiology reports</h4>
    </div>
    <div id="radiology-results-list"><p class="empty-state small">Loading…</p></div>
  `;

  document.getElementById('edit-btn').addEventListener('click', () => renderDrawerEdit(p));
  document.getElementById('record-vitals-btn').addEventListener('click', () => renderVitalsForm(p));
  document.getElementById('record-consult-btn').addEventListener('click', () => renderConsultForm(p));
  document.getElementById('record-med-btn').addEventListener('click', () => renderMedForm(p));
  document.getElementById('upload-doc-btn').addEventListener('click', () => renderDocForm(p));
  document.getElementById('record-immun-btn').addEventListener('click', () => renderImmunForm(p));
  document.getElementById('link-family-btn').addEventListener('click', () => renderFamilyForm(p));
  document.getElementById('photo-btn').addEventListener('click', () => document.getElementById('photo-input').click());
  document.getElementById('photo-input').addEventListener('change', (e) => uploadPhoto(p, e.target.files[0]));
  loadVitals(p);
  loadConsultations(p);
  loadMedications(p);
  loadDocuments(p);
  loadImmunizations(p);
  loadFamilyLinks(p);
  loadLabResults(p);
  loadRadiologyResults(p);
  loadAvatar(p);
}

// ---------- Radiology results (read-only; requested/reported from the Radiology page) ----------
async function loadRadiologyResults(p) {
  const listEl = document.getElementById('radiology-results-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('radiology_orders')
    .select('*')
    .eq('patient_id', p.id)
    .order('requested_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load radiology reports.</p>`;
    return;
  }
  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No radiology exams requested yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(o => `
    <div class="med-entry">
      <div class="med-top">
        <span class="med-name">${o.exam_type}</span>
        <span class="med-status med-status-${o.status === 'completed' ? 'completed' : 'active'}">${o.status}</span>
      </div>
      ${o.status === 'completed'
        ? `<div class="med-meta">${o.impression || o.report_text || 'No findings recorded'}</div>`
        : `<div class="med-meta">Requested ${new Date(o.requested_at).toLocaleDateString()}</div>`}
    </div>
  `).join('');
}

// ---------- Lab results (read-only here; requested/entered from the Laboratory page) ----------
async function loadLabResults(p) {
  const listEl = document.getElementById('lab-results-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('lab_tests')
    .select('*')
    .eq('patient_id', p.id)
    .order('requested_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load lab results.</p>`;
    return;
  }
  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No lab tests requested yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(t => {
    const flagClass = (t.result_flag === 'critical' || t.result_flag === 'abnormal') ? ' vital-flag' : '';
    return `
      <div class="med-entry">
        <div class="med-top">
          <span class="med-name">${t.test_name}</span>
          <span class="med-status med-status-${t.status === 'completed' ? 'completed' : 'active'}">${t.status}</span>
        </div>
        ${t.status === 'completed'
          ? `<div class="med-meta">Result: ${t.result_value || '—'} ${t.reference_range ? `(ref: ${t.reference_range})` : ''} <span class="vitals-chip${flagClass}">${t.result_flag || 'normal'}</span></div>`
          : `<div class="med-meta">Requested ${new Date(t.requested_at).toLocaleDateString()}</div>`}
      </div>
    `;
  }).join('');
}

// ---------- Family links ----------
async function loadFamilyLinks(p) {
  const listEl = document.getElementById('family-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('family_links')
    .select('*')
    .or(`patient_id.eq.${p.id},related_patient_id.eq.${p.id}`);

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load family links.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No family members linked yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(link => {
    const otherId = link.patient_id === p.id ? link.related_patient_id : link.patient_id;
    const other = allPatients.find(x => x.id === otherId);
    const name = other ? `${other.first_name} ${other.surname}` : 'Unknown patient';
    return `
      <div class="patient-row" data-id="${otherId}">
        <div>
          <div class="pr-name">${name}</div>
          <div class="pr-meta">${link.relationship || 'Family member'}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => openDrawer(row.dataset.id));
  });
}

function renderFamilyForm(p) {
  const container = document.getElementById('family-list');
  if (!container) return;

  const options = allPatients
    .filter(x => x.id !== p.id)
    .map(x => `<option value="${x.id}">${x.first_name} ${x.surname} (${x.upi})</option>`)
    .join('');

  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Related patient</label>
        <select id="f_patient">${options}</select>
      </div>
      <div class="edit-field"><label>Relationship</label>
        <select id="f_relationship">
          <option>Spouse</option>
          <option>Child</option>
          <option>Parent</option>
          <option>Sibling</option>
          <option>Guardian</option>
          <option>Other</option>
        </select>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-family-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-family-btn">Save link</button>
      </div>
      <p class="form-status" id="family-status-msg"></p>
    </div>
  `;

  document.getElementById('cancel-family-btn').addEventListener('click', () => loadFamilyLinks(p));
  document.getElementById('save-family-btn').addEventListener('click', () => saveFamilyLink(p));
}

async function saveFamilyLink(p) {
  const statusEl = document.getElementById('family-status-msg');
  const relatedId = document.getElementById('f_patient').value;
  const relationship = document.getElementById('f_relationship').value;

  if (!relatedId) {
    statusEl.textContent = 'No other patients to link yet.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const { error } = await client.from('family_links').insert([{
    patient_id: p.id,
    related_patient_id: relatedId,
    relationship,
  }]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadFamilyLinks(p);
}

// ---------- Immunization history ----------
async function loadImmunizations(p) {
  const listEl = document.getElementById('immun-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('immunizations')
    .select('*')
    .eq('patient_id', p.id)
    .order('date_given', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load immunizations.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No immunizations recorded yet.</p>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  listEl.innerHTML = data.map(im => {
    const overdue = im.due_date && im.due_date < today;
    return `
      <div class="med-entry">
        <div class="med-top">
          <span class="med-name">${im.vaccine_name}${im.dose_number ? ` — ${im.dose_number}` : ''}</span>
          ${overdue ? `<span class="med-status med-status-stopped" style="background:#FBEAE8;color:var(--danger);">overdue</span>` : ''}
        </div>
        <div class="med-meta">Given: ${im.date_given || 'not recorded'}${im.due_date ? ` · Next due: ${im.due_date}` : ''}</div>
        ${im.administered_by ? `<div class="med-meta">By: ${im.administered_by}</div>` : ''}
        ${im.notes ? `<div class="med-meta">${im.notes}</div>` : ''}
      </div>
    `;
  }).join('');
}

function renderImmunForm(p) {
  const container = document.getElementById('immun-list');
  if (!container) return;

  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Vaccine name *</label><input id="i_name" placeholder="e.g. Measles, BCG, Tetanus"></div>
      <div class="grid-2">
        <div class="edit-field"><label>Dose</label><input id="i_dose" placeholder="e.g. 1st dose"></div>
        <div class="edit-field"><label>Date given</label><input type="date" id="i_given"></div>
        <div class="edit-field"><label>Next due date</label><input type="date" id="i_due"></div>
        <div class="edit-field"><label>Administered by</label><input id="i_by"></div>
      </div>
      <div class="edit-field"><label>Notes</label><textarea id="i_notes" rows="2"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-immun-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-immun-btn">Save</button>
      </div>
      <p class="form-status" id="immun-status-msg"></p>
    </div>
  `;

  document.getElementById('cancel-immun-btn').addEventListener('click', () => loadImmunizations(p));
  document.getElementById('save-immun-btn').addEventListener('click', () => saveImmunization(p));
}

async function saveImmunization(p) {
  const statusEl = document.getElementById('immun-status-msg');
  const name = document.getElementById('i_name').value.trim();

  if (!name) {
    statusEl.textContent = 'Vaccine name is required.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const text = (id) => document.getElementById(id).value.trim();

  const record = {
    patient_id: p.id,
    vaccine_name: name,
    dose_number: text('i_dose'),
    date_given: text('i_given') || null,
    due_date: text('i_due') || null,
    administered_by: text('i_by'),
    notes: text('i_notes'),
  };

  const { error } = await client.from('immunizations').insert([record]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadImmunizations(p);
}

function initials(p) {
  return `${(p.first_name || '?')[0]}${(p.surname || '?')[0]}`.toUpperCase();
}

// ---------- Photo ----------
async function loadAvatar(p) {
  const el = document.getElementById('patient-avatar');
  if (!el || !p.photo_path) return;
  const { data, error } = await client.storage.from('patient-files').createSignedUrl(p.photo_path, 3600);
  if (!error && data) {
    el.innerHTML = `<img src="${data.signedUrl}" alt="Patient photo">`;
  }
}

async function uploadPhoto(p, file) {
  if (!file) return;
  const path = `patients/${p.id}/photo-${Date.now()}.${file.name.split('.').pop()}`;

  const { error: uploadErr } = await client.storage.from('patient-files').upload(path, file);
  if (uploadErr) {
    alert(`Couldn't upload photo: ${uploadErr.message}`);
    return;
  }

  const { error: updateErr } = await client.from('patients').update({ photo_path: path }).eq('id', p.id);
  if (updateErr) {
    alert(`Photo uploaded but couldn't link it: ${updateErr.message}`);
    return;
  }

  await loadPatients();
  const refreshed = allPatients.find(x => String(x.id) === String(p.id));
  if (refreshed) loadAvatar(refreshed);
}

// ---------- Documents ----------
async function loadDocuments(p) {
  const listEl = document.getElementById('doc-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('documents')
    .select('*')
    .eq('patient_id', p.id)
    .order('uploaded_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load documents.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No documents uploaded yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(d => `
    <div class="doc-entry">
      <div>
        <div class="doc-name">${d.file_name}</div>
        <div class="med-meta">${d.doc_type || 'Document'} · ${new Date(d.uploaded_at).toLocaleDateString()}</div>
      </div>
      <button class="btn-ghost btn-small doc-view-btn" data-path="${d.storage_path}">View</button>
    </div>
  `).join('');

  listEl.querySelectorAll('.doc-view-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { data, error } = await client.storage.from('patient-files').createSignedUrl(btn.dataset.path, 300);
      if (!error && data) window.open(data.signedUrl, '_blank');
    });
  });
}

function renderDocForm(p) {
  const container = document.getElementById('doc-list');
  if (!container) return;

  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Document type</label>
        <select id="d_type">
          <option>Referral letter</option>
          <option>Discharge summary</option>
          <option>Medical certificate</option>
          <option>Laboratory report</option>
          <option>Other</option>
        </select>
      </div>
      <div class="edit-field"><label>File</label><input type="file" id="d_file"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-doc-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-doc-btn">Upload</button>
      </div>
      <p class="form-status" id="doc-status-msg"></p>
    </div>
  `;

  document.getElementById('cancel-doc-btn').addEventListener('click', () => loadDocuments(p));
  document.getElementById('save-doc-btn').addEventListener('click', () => saveDocument(p));
}

async function saveDocument(p) {
  const statusEl = document.getElementById('doc-status-msg');
  const file = document.getElementById('d_file').files[0];
  const docType = document.getElementById('d_type').value;

  if (!file) {
    statusEl.textContent = 'Choose a file first.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Uploading…';
  statusEl.className = 'form-status';

  const path = `patients/${p.id}/docs/${Date.now()}-${file.name}`;
  const { error: uploadErr } = await client.storage.from('patient-files').upload(path, file);

  if (uploadErr) {
    statusEl.textContent = `Couldn't upload: ${uploadErr.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  const { error: insertErr } = await client.from('documents').insert([{
    patient_id: p.id,
    file_name: file.name,
    storage_path: path,
    doc_type: docType,
  }]);

  if (insertErr) {
    statusEl.textContent = `File uploaded but couldn't save record: ${insertErr.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadDocuments(p);
}

// ---------- Current medications ----------
async function loadMedications(p) {
  const listEl = document.getElementById('med-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('medications')
    .select('*')
    .eq('patient_id', p.id)
    .order('status', { ascending: true })
    .order('start_date', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load medications.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No medications recorded yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(m => `
    <div class="med-entry">
      <div class="med-top">
        <span class="med-name">${m.medicine_name}</span>
        <span class="med-status med-status-${m.status}">${m.status}</span>
      </div>
      <div class="med-meta">${[m.dose, m.frequency, m.route].filter(Boolean).join(' · ') || '—'}</div>
      <div class="med-meta">${m.start_date || 'start date unknown'}${m.end_date ? ` → ${m.end_date}` : ''}</div>
      ${m.notes ? `<div class="med-meta">${m.notes}</div>` : ''}
      ${m.status === 'active' ? `<button class="btn-ghost btn-small med-stop-btn" data-id="${m.id}">Mark stopped</button>` : ''}
    </div>
  `).join('');

  listEl.querySelectorAll('.med-stop-btn').forEach(btn => {
    btn.addEventListener('click', () => markMedStopped(p, btn.dataset.id));
  });
}

async function markMedStopped(p, id) {
  await client.from('medications').update({ status: 'stopped' }).eq('id', id);
  await loadMedications(p);
}

function renderMedForm(p) {
  const container = document.getElementById('med-list');
  if (!container) return;

  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Medicine name *</label><input id="m_name"></div>
      <div class="grid-2">
        <div class="edit-field"><label>Dose</label><input id="m_dose" placeholder="e.g. 500mg"></div>
        <div class="edit-field"><label>Frequency</label><input id="m_freq" placeholder="e.g. BD"></div>
        <div class="edit-field"><label>Route</label><input id="m_route" placeholder="e.g. Oral"></div>
        <div class="edit-field"><label>Start date</label><input type="date" id="m_start"></div>
      </div>
      <div class="edit-field"><label>Notes</label><textarea id="m_notes" rows="2"></textarea></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-med-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-med-btn">Save medication</button>
      </div>
      <p class="form-status" id="med-status-msg"></p>
    </div>
  `;

  document.getElementById('cancel-med-btn').addEventListener('click', () => loadMedications(p));
  document.getElementById('save-med-btn').addEventListener('click', () => saveMedication(p));
}

async function saveMedication(p) {
  const statusEl = document.getElementById('med-status-msg');
  const name = document.getElementById('m_name').value.trim();

  if (!name) {
    statusEl.textContent = 'Medicine name is required.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const text = (id) => document.getElementById(id).value.trim();

  const record = {
    patient_id: p.id,
    medicine_name: name,
    dose: text('m_dose'),
    frequency: text('m_freq'),
    route: text('m_route'),
    start_date: text('m_start') || null,
    notes: text('m_notes'),
    status: 'active',
  };

  const { error } = await client.from('medications').insert([record]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadMedications(p);
}

// ---------- Clinical consultations ----------
async function loadConsultations(p) {
  const listEl = document.getElementById('consult-list');
  if (!listEl) return;

  const { data, error } = await client
    .from('consultations')
    .select('*')
    .eq('patient_id', p.id)
    .order('recorded_at', { ascending: false });

  if (error) {
    listEl.innerHTML = `<p class="empty-state small">Couldn't load consultations.</p>`;
    return;
  }

  if (!data.length) {
    listEl.innerHTML = `<p class="empty-state small">No consultations recorded yet.</p>`;
    return;
  }

  listEl.innerHTML = data.map(c => `
    <div class="vitals-entry">
      <div class="vitals-date">${new Date(c.recorded_at).toLocaleString()}${c.follow_up_date ? ` · Follow-up: ${c.follow_up_date}` : ''}</div>
      ${c.chief_complaint ? `<dt class="consult-label">Chief complaint</dt><dd class="consult-text">${c.chief_complaint}</dd>` : ''}
      ${c.diagnosis ? `<dt class="consult-label">Diagnosis</dt><dd class="consult-text">${c.diagnosis}</dd>` : ''}
      ${c.treatment_plan ? `<dt class="consult-label">Treatment plan</dt><dd class="consult-text">${c.treatment_plan}</dd>` : ''}
      ${c.prescription ? `<dt class="consult-label">Prescription</dt><dd class="consult-text">${c.prescription}</dd>` : ''}
      ${c.history_notes ? `<dt class="consult-label">Notes</dt><dd class="consult-text">${c.history_notes}</dd>` : ''}
    </div>
  `).join('');
}

function renderConsultForm(p) {
  const container = document.getElementById('consult-list');
  if (!container) return;

  container.innerHTML = `
    <div class="vitals-form">
      <div class="edit-field"><label>Chief complaint</label><textarea id="c_complaint" rows="2"></textarea></div>
      <div class="edit-field"><label>History / notes</label><textarea id="c_history" rows="2"></textarea></div>
      <div class="edit-field"><label>Diagnosis</label><textarea id="c_diagnosis" rows="2"></textarea></div>
      <div class="edit-field"><label>Treatment plan</label><textarea id="c_treatment" rows="2"></textarea></div>
      <div class="edit-field"><label>Prescription</label><textarea id="c_prescription" rows="2" placeholder="e.g. Amoxicillin 500mg TDS x5 days"></textarea></div>
      <div class="edit-field"><label>Follow-up date</label><input type="date" id="c_followup"></div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-consult-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-consult-btn">Save consultation</button>
      </div>
      <p class="form-status" id="consult-status"></p>
    </div>
  `;

  document.getElementById('cancel-consult-btn').addEventListener('click', () => loadConsultations(p));
  document.getElementById('save-consult-btn').addEventListener('click', () => saveConsultation(p));
}

async function saveConsultation(p) {
  const statusEl = document.getElementById('consult-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const text = (id) => document.getElementById(id).value.trim();

  const record = {
    patient_id: p.id,
    chief_complaint: text('c_complaint'),
    history_notes: text('c_history'),
    diagnosis: text('c_diagnosis'),
    treatment_plan: text('c_treatment'),
    prescription: text('c_prescription'),
    follow_up_date: text('c_followup') || null,
  };

  const { error } = await client.from('consultations').insert([record]);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadConsultations(p);
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
    <div class="edit-field"><label>Category</label>
      <select id="e_category">
        ${['New Patient','Returning Patient','Emergency','Private','Insurance','Corporate','Government Scheme','Research Participant','VIP','Staff'].map(c =>
          `<option ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
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
    category: ev('e_category'),
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

  const params = new URLSearchParams(window.location.search);
  const jumpToId = params.get('patient');
  if (jumpToId) openDrawer(jumpToId);
})();
