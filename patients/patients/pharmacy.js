// `client` is created by auth-guard.js, which loads before this file.

const els = {
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
  medicineList: document.getElementById('medicine-list'),
  addMedicineBtn: document.getElementById('add-medicine-btn'),
  addMedicineForm: document.getElementById('add-medicine-form'),
  dispenseMedicine: document.getElementById('dispense-medicine'),
  dispenseQty: document.getElementById('dispense-qty'),
  dispenseBtn: document.getElementById('dispense-btn'),
  dispenseStatus: document.getElementById('dispense-status'),
  dispenseLog: document.getElementById('dispense-log'),
  patientSearch: document.getElementById('dispense-patient-search'),
  patientResults: document.getElementById('dispense-patient-results'),
  patientIdField: document.getElementById('dispense-patient-id'),
  selectedPatientLabel: document.getElementById('dispense-selected-patient'),
};

let medicines = [];
let patients = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('medicines').select('id').limit(1);
  if (error) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Connection error';
    return false;
  }
  els.connDot.className = 'dot online';
  els.connLabel.textContent = 'Connected';
  return true;
}

// ---------- Medicines ----------
async function loadMedicines() {
  const { data, error } = await client.from('medicines').select('*').order('name');
  if (error) {
    els.medicineList.innerHTML = `<p class="empty-state">Couldn't load medicines.</p>`;
    return;
  }
  medicines = data || [];
  renderMedicineList();
  renderMedicineDropdown();
}

function renderMedicineList() {
  if (!medicines.length) {
    els.medicineList.innerHTML = `<p class="empty-state">No medicines added yet.</p>`;
    return;
  }
  els.medicineList.innerHTML = medicines.map(m => {
    const low = m.stock_qty <= m.reorder_level;
    return `
      <div class="patient-row" style="cursor:default;">
        <div>
          <div class="pr-name">${m.name}${m.strength ? ` ${m.strength}` : ''}</div>
          <div class="pr-meta">${m.form || 'unit'} · stock: ${m.stock_qty}${low ? ' ⚠ low' : ''} · UGX ${m.unit_price ?? 0}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderMedicineDropdown() {
  els.dispenseMedicine.innerHTML = medicines
    .map(m => `<option value="${m.id}">${m.name}${m.strength ? ' ' + m.strength : ''} (stock: ${m.stock_qty})</option>`)
    .join('');
}

els.addMedicineBtn.addEventListener('click', () => {
  els.addMedicineForm.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Name *</label><input id="new-med-name"></div>
        <div class="edit-field"><label>Strength</label><input id="new-med-strength" placeholder="e.g. 500mg"></div>
        <div class="edit-field"><label>Form</label><input id="new-med-form" placeholder="e.g. Tablet"></div>
        <div class="edit-field"><label>Unit price (UGX)</label><input type="number" id="new-med-price"></div>
        <div class="edit-field"><label>Starting stock</label><input type="number" id="new-med-stock" value="0"></div>
        <div class="edit-field"><label>Reorder level</label><input type="number" id="new-med-reorder" value="10"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-med-add">Cancel</button>
        <button type="button" class="btn-primary" id="save-med-add">Save medicine</button>
      </div>
      <p class="form-status" id="med-add-status"></p>
    </div>
  `;
  document.getElementById('cancel-med-add').addEventListener('click', () => els.addMedicineForm.innerHTML = '');
  document.getElementById('save-med-add').addEventListener('click', saveNewMedicine);
});

async function saveNewMedicine() {
  const statusEl = document.getElementById('med-add-status');
  const name = document.getElementById('new-med-name').value.trim();
  if (!name) {
    statusEl.textContent = 'Name is required.';
    statusEl.className = 'form-status err';
    return;
  }
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const record = {
    name,
    strength: document.getElementById('new-med-strength').value.trim(),
    form: document.getElementById('new-med-form').value.trim(),
    unit_price: Number(document.getElementById('new-med-price').value) || 0,
    stock_qty: Number(document.getElementById('new-med-stock').value) || 0,
    reorder_level: Number(document.getElementById('new-med-reorder').value) || 10,
  };

  const { error } = await client.from('medicines').insert([record]);
  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  els.addMedicineForm.innerHTML = '';
  await loadMedicines();
}

// ---------- Patient search for dispensing ----------
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

// ---------- Dispense ----------
els.dispenseBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  const medicineId = els.dispenseMedicine.value;
  const qty = Number(els.dispenseQty.value);

  if (!patientId) {
    els.dispenseStatus.textContent = 'Select a patient first.';
    els.dispenseStatus.className = 'form-status err';
    return;
  }
  if (!medicineId || !qty || qty < 1) {
    els.dispenseStatus.textContent = 'Select a medicine and a valid quantity.';
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  const med = medicines.find(m => m.id === medicineId);
  if (!med) return;

  if (qty > med.stock_qty) {
    els.dispenseStatus.textContent = `Not enough stock — only ${med.stock_qty} left.`;
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  els.dispenseStatus.textContent = 'Dispensing…';
  els.dispenseStatus.className = 'form-status';

  const unitPrice = med.unit_price || 0;
  const { error: dispenseErr } = await client.from('dispenses').insert([{
    patient_id: patientId,
    medicine_id: medicineId,
    quantity: qty,
    unit_price: unitPrice,
    total_price: unitPrice * qty,
  }]);

  if (dispenseErr) {
    els.dispenseStatus.textContent = `Couldn't dispense: ${dispenseErr.message}`;
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  const { error: stockErr } = await client
    .from('medicines')
    .update({ stock_qty: med.stock_qty - qty })
    .eq('id', medicineId);

  if (stockErr) {
    els.dispenseStatus.textContent = `Dispensed but stock update failed: ${stockErr.message}`;
    els.dispenseStatus.className = 'form-status err';
  } else {
    els.dispenseStatus.textContent = `Dispensed ${qty} × ${med.name} to ${els.patientSearch.value}.`;
    els.dispenseStatus.className = 'form-status ok';
  }

  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.dispenseQty.value = 1;

  await loadMedicines();
  await loadDispenseLog();
});

// ---------- Recent dispenses ----------
async function loadDispenseLog() {
  const { data, error } = await client
    .from('dispenses')
    .select('*')
    .order('dispensed_at', { ascending: false })
    .limit(15);

  if (error) {
    els.dispenseLog.innerHTML = `<p class="empty-state">Couldn't load dispense log.</p>`;
    return;
  }
  if (!data.length) {
    els.dispenseLog.innerHTML = `<p class="empty-state">No dispenses recorded yet.</p>`;
    return;
  }

  els.dispenseLog.innerHTML = data.map(d => {
    const med = medicines.find(m => m.id === d.medicine_id);
    const pat = patients.find(p => p.id === d.patient_id);
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${med ? med.name : 'Unknown medicine'} × ${d.quantity}</div>
          <div class="med-meta">${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'} · ${new Date(d.dispensed_at).toLocaleString()}</div>
        </div>
        <div class="pr-meta">UGX ${d.total_price ?? 0}</div>
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
  await loadMedicines();
  await loadDispenseLog();
})();
