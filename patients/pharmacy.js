// `client` is created by auth-guard.js, which loads before this file.

const els = {
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
  medicineList: document.getElementById('medicine-list'),
  addMedicineBtn: document.getElementById('add-medicine-btn'),
  addMedicineForm: document.getElementById('add-medicine-form'),

  customerType: document.getElementById('customer-type'),
  patientSelectArea: document.getElementById('patient-select-area'),
  walkinArea: document.getElementById('walkin-area'),
  walkinName: document.getElementById('walkin-name'),

  dispenseMedicine: document.getElementById('dispense-medicine'),
  dispenseQty: document.getElementById('dispense-qty'),
  addToCartBtn: document.getElementById('add-to-cart-btn'),
  cartItems: document.getElementById('cart-items'),
  totalDisplay: document.getElementById('dispense-total-display'),

  paymentMethod: document.getElementById('dispense-payment-method'),
  amountReceived: document.getElementById('dispense-amount-received'),
  changeDisplay: document.getElementById('dispense-change-display'),

  dispenseBtn: document.getElementById('dispense-btn'),
  dispenseStatus: document.getElementById('dispense-status'),
  receiptArea: document.getElementById('receipt-area'),
  dispenseLog: document.getElementById('dispense-log'),

  patientSearch: document.getElementById('dispense-patient-search'),
  patientResults: document.getElementById('dispense-patient-results'),
  patientIdField: document.getElementById('dispense-patient-id'),
  selectedPatientLabel: document.getElementById('dispense-selected-patient'),
};

let medicines = [];
let patients = [];
let cart = []; // { medicineId, name, qty, unitPrice }

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

// ---------- Customer type toggle ----------
els.customerType.addEventListener('change', () => {
  const isWalkin = els.customerType.value === 'walkin';
  els.patientSelectArea.style.display = isWalkin ? 'none' : 'block';
  els.walkinArea.style.display = isWalkin ? 'block' : 'none';
});

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

// ---------- Patient search (for registered-patient sales) ----------
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

// ---------- Cart ----------
els.addToCartBtn.addEventListener('click', () => {
  const medId = els.dispenseMedicine.value;
  const qty = Number(els.dispenseQty.value);
  const med = medicines.find(m => m.id === medId);

  if (!med) return;
  if (!qty || qty < 1) {
    els.dispenseStatus.textContent = 'Enter a valid quantity.';
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  const alreadyInCart = cart.filter(c => c.medicineId === medId).reduce((sum, c) => sum + c.qty, 0);
  if (alreadyInCart + qty > med.stock_qty) {
    els.dispenseStatus.textContent = `Not enough stock — only ${med.stock_qty} available.`;
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  cart.push({
    medicineId: med.id,
    name: `${med.name}${med.strength ? ' ' + med.strength : ''}`,
    qty,
    unitPrice: med.unit_price || 0,
  });

  els.dispenseStatus.textContent = '';
  els.dispenseQty.value = 1;
  renderCart();
});

function renderCart() {
  if (!cart.length) {
    els.cartItems.innerHTML = `<p class="empty-state small">No items added yet.</p>`;
    els.totalDisplay.textContent = '';
    return;
  }

  els.cartItems.innerHTML = cart.map((item, i) => `
    <div class="doc-entry">
      <div>
        <div class="doc-name">${item.name}</div>
        <div class="med-meta">${item.qty} × UGX ${item.unitPrice.toLocaleString()} = UGX ${(item.qty * item.unitPrice).toLocaleString()}</div>
      </div>
      <button class="btn-ghost btn-small remove-cart-item" data-index="${i}">Remove</button>
    </div>
  `).join('');

  els.cartItems.querySelectorAll('.remove-cart-item').forEach(btn => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.index), 1);
      renderCart();
    });
  });

  const total = cartTotal();
  els.totalDisplay.textContent = `Total: UGX ${total.toLocaleString()}`;
  updateChange();
}

function cartTotal() {
  return cart.reduce((sum, c) => sum + c.qty * c.unitPrice, 0);
}

els.amountReceived.addEventListener('input', updateChange);

function updateChange() {
  const received = Number(els.amountReceived.value) || 0;
  const total = cartTotal();
  const change = received - total;
  if (!els.amountReceived.value) {
    els.changeDisplay.textContent = '';
    return;
  }
  els.changeDisplay.textContent = change >= 0
    ? `Change due: UGX ${change.toLocaleString()}`
    : `Short by: UGX ${Math.abs(change).toLocaleString()}`;
  els.changeDisplay.className = change >= 0 ? 'form-status ok' : 'form-status err';
}

// ---------- Complete sale ----------
els.dispenseBtn.addEventListener('click', async () => {
  if (!cart.length) {
    els.dispenseStatus.textContent = 'Add at least one item to the sale.';
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  const isWalkin = els.customerType.value === 'walkin';
  const patientId = isWalkin ? null : (els.patientIdField.value || null);
  const customerName = isWalkin ? els.walkinName.value.trim() : null;

  if (!isWalkin && !patientId) {
    els.dispenseStatus.textContent = 'Select a patient, or switch to Walk-in / OTC customer.';
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  els.dispenseStatus.textContent = 'Processing sale…';
  els.dispenseStatus.className = 'form-status';

  const total = cartTotal();
  const received = Number(els.amountReceived.value) || 0;
  const change = received - total;

  const { data: sale, error: saleErr } = await client
    .from('pos_sales')
    .insert([{
      patient_id: patientId,
      customer_name: customerName,
      payment_method: els.paymentMethod.value,
      total_amount: total,
      amount_received: received,
      change_due: change > 0 ? change : 0,
    }])
    .select()
    .single();

  if (saleErr) {
    els.dispenseStatus.textContent = `Couldn't process sale: ${saleErr.message}`;
    els.dispenseStatus.className = 'form-status err';
    return;
  }

  // Insert one dispense row per cart item, and deduct stock
  for (const item of cart) {
    await client.from('dispenses').insert([{
      patient_id: patientId,
      medicine_id: item.medicineId,
      quantity: item.qty,
      unit_price: item.unitPrice,
      total_price: item.qty * item.unitPrice,
      sale_id: sale.id,
    }]);

    const med = medicines.find(m => m.id === item.medicineId);
    if (med) {
      await client.from('medicines').update({ stock_qty: med.stock_qty - item.qty }).eq('id', item.medicineId);
    }
  }

  showReceipt(sale, cart, isWalkin ? (customerName || 'Walk-in customer') : els.patientSearch.value);

  els.dispenseStatus.textContent = 'Sale completed.';
  els.dispenseStatus.className = 'form-status ok';

  // reset
  cart = [];
  renderCart();
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.walkinName.value = '';
  els.amountReceived.value = '';
  els.changeDisplay.textContent = '';

  await loadMedicines();
  await loadDispenseLog();
});

function showReceipt(sale, items, customerLabel) {
  els.receiptArea.innerHTML = `
    <div class="med-entry" style="margin-top:14px; border:1px dashed var(--accent);">
      <div class="med-top"><span class="med-name">Receipt</span><span class="med-meta">${new Date(sale.created_at).toLocaleString()}</span></div>
      <div class="med-meta" style="margin-top:6px;">${customerLabel}</div>
      <div style="margin-top:8px;">
        ${items.map(i => `<div class="consult-text">${i.qty} × ${i.name} — UGX ${(i.qty * i.unitPrice).toLocaleString()}</div>`).join('')}
      </div>
      <div class="med-meta" style="margin-top:8px; font-weight:600;">Total: UGX ${sale.total_amount.toLocaleString()}</div>
      <div class="med-meta">Paid (${sale.payment_method}): UGX ${sale.amount_received.toLocaleString()}</div>
      ${sale.change_due > 0 ? `<div class="med-meta">Change given: UGX ${sale.change_due.toLocaleString()}</div>` : ''}
    </div>
  `;
}

// ---------- Recent sales ----------
async function loadDispenseLog() {
  const { data, error } = await client
    .from('pos_sales')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(15);

  if (error) {
    els.dispenseLog.innerHTML = `<p class="empty-state">Couldn't load recent sales.</p>`;
    return;
  }
  if (!data.length) {
    els.dispenseLog.innerHTML = `<p class="empty-state">No sales recorded yet.</p>`;
    return;
  }

  els.dispenseLog.innerHTML = data.map(s => {
    const pat = patients.find(p => p.id === s.patient_id);
    const label = pat ? `${pat.first_name} ${pat.surname}` : (s.customer_name || 'Walk-in customer');
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${label}</div>
          <div class="med-meta">${s.payment_method || ''} · ${new Date(s.created_at).toLocaleString()}</div>
        </div>
        <div class="pr-meta">UGX ${s.total_amount.toLocaleString()}</div>
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
