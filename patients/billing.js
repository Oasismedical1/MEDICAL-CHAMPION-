// `client` is created by auth-guard.js, which loads before this file.

const els = {
  invoicePreview: document.getElementById('invoice-preview'),
  patientSearch: document.getElementById('bill-patient-search'),
  patientResults: document.getElementById('bill-patient-results'),
  patientIdField: document.getElementById('bill-patient-id'),
  selectedPatientLabel: document.getElementById('bill-selected-patient'),
  insuranceProvider: document.getElementById('bill-insurance-provider'),
  membershipNumber: document.getElementById('bill-membership-number'),
  itemsRows: document.getElementById('bill-items-rows'),
  addItemBtn: document.getElementById('add-item-row-btn'),
  totalDisplay: document.getElementById('bill-total-display'),
  createBtn: document.getElementById('create-bill-btn'),
  createStatus: document.getElementById('bill-create-status'),
  billsList: document.getElementById('bills-list'),
  expCategory: document.getElementById('exp-category'),
  expAmount: document.getElementById('exp-amount'),
  expSupplier: document.getElementById('exp-supplier'),
  expDescription: document.getElementById('exp-description'),
  saveExpenseBtn: document.getElementById('save-expense-btn'),
  expenseStatus: document.getElementById('expense-status'),
  expensesList: document.getElementById('expenses-list'),
};

let patients = [];
let rowCount = 0;
let billCount = 0;

function nextInvoiceNumber() {
  const year = new Date().getFullYear();
  const seq = String(billCount + 1).padStart(6, '0');
  return `INV-${year}-${seq}`;
}

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('bills').select('id').limit(1);
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

// ---------- Line items ----------
function addItemRow() {
  rowCount++;
  const id = `row-${rowCount}`;
  const row = document.createElement('div');
  row.className = 'grid-2';
  row.style.marginTop = '8px';
  row.id = id;
  row.innerHTML = `
    <div class="edit-field"><label>Description</label><input class="item-desc" placeholder="e.g. Consultation fee"></div>
    <div class="edit-field"><label>Type</label>
      <select class="item-type">
        <option>Consultation</option>
        <option>Pharmacy</option>
        <option>Laboratory</option>
        <option>Procedure</option>
        <option>Other</option>
      </select>
    </div>
    <div class="edit-field"><label>Amount (UGX)</label><input type="number" class="item-amount" min="0"></div>
    <div class="edit-field" style="justify-content:flex-end;"><button type="button" class="btn-ghost btn-small remove-row-btn" data-row="${id}">Remove</button></div>
  `;
  els.itemsRows.appendChild(row);

  row.querySelector('.item-amount').addEventListener('input', updateTotal);
  row.querySelector('.remove-row-btn').addEventListener('click', () => {
    row.remove();
    updateTotal();
  });
}

function updateTotal() {
  const amounts = [...els.itemsRows.querySelectorAll('.item-amount')].map(i => Number(i.value) || 0);
  const total = amounts.reduce((sum, a) => sum + a, 0);
  els.totalDisplay.textContent = `Total: UGX ${total.toLocaleString()}`;
}

els.addItemBtn.addEventListener('click', addItemRow);
addItemRow(); // start with one row

// ---------- Create bill ----------
els.createBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  if (!patientId) {
    els.createStatus.textContent = 'Select a patient first.';
    els.createStatus.className = 'form-status err';
    return;
  }

  const rows = [...els.itemsRows.children];
  const items = rows.map(row => ({
    description: row.querySelector('.item-desc').value.trim(),
    source_type: row.querySelector('.item-type').value,
    amount: Number(row.querySelector('.item-amount').value) || 0,
  })).filter(i => i.description && i.amount > 0);

  if (!items.length) {
    els.createStatus.textContent = 'Add at least one line item with a description and amount.';
    els.createStatus.className = 'form-status err';
    return;
  }

  els.createStatus.textContent = 'Creating bill…';
  els.createStatus.className = 'form-status';

  const total = items.reduce((sum, i) => sum + i.amount, 0);
  const invoiceNumber = nextInvoiceNumber();
  const provider = els.insuranceProvider.value.trim();

  const { data: bill, error: billErr } = await client
    .from('bills')
    .insert([{
      invoice_number: invoiceNumber,
      patient_id: patientId,
      total_amount: total,
      insurance_provider: provider || null,
      membership_number: els.membershipNumber.value.trim() || null,
      claim_status: provider ? 'pending' : 'not applicable',
    }])
    .select()
    .single();

  if (billErr) {
    els.createStatus.textContent = `Couldn't create bill: ${billErr.message}`;
    els.createStatus.className = 'form-status err';
    return;
  }

  const itemRecords = items.map(i => ({ ...i, bill_id: bill.id }));
  const { error: itemsErr } = await client.from('bill_items').insert(itemRecords);

  if (itemsErr) {
    els.createStatus.textContent = `Bill created but items failed: ${itemsErr.message}`;
    els.createStatus.className = 'form-status err';
    return;
  }

  els.createStatus.textContent = `Bill created — UGX ${total.toLocaleString()}`;
  els.createStatus.className = 'form-status ok';

  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.insuranceProvider.value = '';
  els.membershipNumber.value = '';
  els.itemsRows.innerHTML = '';
  addItemRow();
  updateTotal();

  await loadBills();
});

// ---------- Recent bills & payments ----------
async function loadBills() {
  const { data, error } = await client
    .from('bills')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    els.billsList.innerHTML = `<p class="empty-state">Couldn't load bills.</p>`;
    return;
  }
  if (!data.length) {
    els.billsList.innerHTML = `<p class="empty-state">No bills created yet.</p>`;
    return;
  }

  const { count: totalBillCount } = await client.from('bills').select('id', { count: 'exact', head: true });
  billCount = totalBillCount || 0;
  els.invoicePreview.textContent = nextInvoiceNumber();

  els.billsList.innerHTML = data.map(b => {
    const pat = patients.find(p => p.id === b.patient_id);
    const balance = b.total_amount - b.amount_paid;
    return `
      <div class="patient-row" data-id="${b.id}">
        <div>
          <div class="pr-name">${b.invoice_number || '—'} · ${pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient'}</div>
          <div class="pr-meta">UGX ${b.total_amount.toLocaleString()} · paid ${b.amount_paid.toLocaleString()} · <span class="med-status ${b.status === 'paid' ? 'med-status-completed' : (b.status === 'partial' ? 'med-status-active' : 'med-status-stopped')}">${b.status}</span>${b.insurance_provider ? ` · ${b.insurance_provider} (${b.claim_status})` : ''}</div>
        </div>
        ${b.status !== 'paid' ? `<span>→</span>` : ''}
      </div>
    `;
  }).join('');

  els.billsList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => {
      const bill = data.find(b => b.id === row.dataset.id);
      if (bill && bill.status !== 'paid') renderPaymentForm(bill);
    });
  });
}

function renderPaymentForm(bill) {
  els.billsList.innerHTML = `
    <div class="vitals-form">
      <p class="form-status" style="color:var(--ink);">Balance due: UGX ${(bill.total_amount - bill.amount_paid).toLocaleString()}</p>
      <div class="grid-2">
        <div class="edit-field"><label>Payment amount (UGX)</label><input type="number" id="pay-amount" min="0"></div>
        <div class="edit-field"><label>Method</label>
          <select id="pay-method">
            <option>Cash</option>
            <option>Mobile Money</option>
            <option>Debit Card</option>
            <option>Credit Card</option>
            <option>Bank Transfer</option>
            <option>Insurance</option>
            <option>Corporate Credit</option>
            <option>Government Scheme</option>
          </select>
        </div>
      </div>
      ${bill.insurance_provider ? `
        <div class="edit-field"><label>Claim status</label>
          <select id="pay-claim-status">
            <option value="pending" ${bill.claim_status === 'pending' ? 'selected' : ''}>Pending</option>
            <option value="submitted" ${bill.claim_status === 'submitted' ? 'selected' : ''}>Submitted</option>
            <option value="approved" ${bill.claim_status === 'approved' ? 'selected' : ''}>Approved</option>
            <option value="rejected" ${bill.claim_status === 'rejected' ? 'selected' : ''}>Rejected</option>
          </select>
        </div>
      ` : ''}
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-pay-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-pay-btn">Record payment</button>
      </div>
      <p class="form-status" id="pay-status"></p>
    </div>
  `;

  document.getElementById('cancel-pay-btn').addEventListener('click', loadBills);
  document.getElementById('save-pay-btn').addEventListener('click', () => savePayment(bill));
}

async function savePayment(bill) {
  const statusEl = document.getElementById('pay-status');
  const amount = Number(document.getElementById('pay-amount').value) || 0;

  if (amount <= 0) {
    statusEl.textContent = 'Enter a valid amount.';
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const newPaid = bill.amount_paid + amount;
  const newStatus = newPaid >= bill.total_amount ? 'paid' : 'partial';
  const claimField = document.getElementById('pay-claim-status');

  const updatePayload = {
    amount_paid: newPaid,
    status: newStatus,
    payment_method: document.getElementById('pay-method').value,
  };
  if (claimField) updatePayload.claim_status = claimField.value;

  const { error } = await client.from('bills').update(updatePayload).eq('id', bill.id);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  await loadBills();
}

// ---------- Expenses ----------
els.saveExpenseBtn.addEventListener('click', async () => {
  const amount = Number(els.expAmount.value) || 0;
  if (amount <= 0) {
    els.expenseStatus.textContent = 'Enter a valid amount.';
    els.expenseStatus.className = 'form-status err';
    return;
  }

  els.expenseStatus.textContent = 'Saving…';
  els.expenseStatus.className = 'form-status';

  const { error } = await client.from('expenses').insert([{
    category: els.expCategory.value,
    amount,
    supplier: els.expSupplier.value.trim(),
    description: els.expDescription.value.trim(),
  }]);

  if (error) {
    els.expenseStatus.textContent = `Couldn't save: ${error.message}`;
    els.expenseStatus.className = 'form-status err';
    return;
  }

  els.expenseStatus.textContent = 'Expense recorded.';
  els.expenseStatus.className = 'form-status ok';
  els.expAmount.value = '';
  els.expSupplier.value = '';
  els.expDescription.value = '';

  await loadExpenses();
});

async function loadExpenses() {
  const { data, error } = await client
    .from('expenses')
    .select('*')
    .order('recorded_at', { ascending: false })
    .limit(15);

  if (error) {
    els.expensesList.innerHTML = `<p class="empty-state">Couldn't load expenses.</p>`;
    return;
  }
  if (!data.length) {
    els.expensesList.innerHTML = `<p class="empty-state">No expenses recorded yet.</p>`;
    return;
  }

  els.expensesList.innerHTML = data.map(e => `
    <div class="doc-entry">
      <div>
        <div class="doc-name">${e.category}${e.supplier ? ` — ${e.supplier}` : ''}</div>
        <div class="med-meta">${e.description || ''} ${new Date(e.recorded_at).toLocaleDateString()}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="pr-meta">UGX ${e.amount.toLocaleString()}</span>
        <span class="med-status ${e.payment_status === 'paid' ? 'med-status-completed' : 'med-status-stopped'}">${e.payment_status}</span>
      </div>
    </div>
  `).join('');
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
  await loadBills();
  await loadExpenses();
})();
