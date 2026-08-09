// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('lab-patient-search'),
  patientResults: document.getElementById('lab-patient-results'),
  patientIdField: document.getElementById('lab-patient-id'),
  selectedPatientLabel: document.getElementById('lab-selected-patient'),
  customerType: document.getElementById('lab-customer-type'),
  patientSelectArea: document.getElementById('lab-patient-select-area'),
  walkinArea: document.getElementById('lab-walkin-area'),
  walkinName: document.getElementById('lab-walkin-name'),
  testName: document.getElementById('lab-test-name'),
  sampleType: document.getElementById('lab-sample-type'),
  addTestBtn: document.getElementById('add-test-to-cart-btn'),
  cartItems: document.getElementById('lab-cart-items'),
  amountCharged: document.getElementById('lab-amount-charged'),
  paymentMethod: document.getElementById('lab-payment-method'),
  amountReceived: document.getElementById('lab-amount-received'),
  changeDisplay: document.getElementById('lab-change-display'),
  requestBtn: document.getElementById('lab-request-btn'),
  requestStatus: document.getElementById('lab-request-status'),
  receiptArea: document.getElementById('lab-receipt-area'),
  pendingList: document.getElementById('lab-pending-list'),
  completedList: document.getElementById('lab-completed-list'),
};

let patients = [];
let cart = []; // { testName, sampleType }

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('lab_tests').select('id').limit(1);
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

// ---------- Customer type toggle ----------
els.customerType.addEventListener('change', () => {
  const isWalkin = els.customerType.value === 'walkin';
  els.patientSelectArea.style.display = isWalkin ? 'none' : 'block';
  els.walkinArea.style.display = isWalkin ? 'block' : 'none';
});

// ---------- Patients (for search) ----------
async function loadPatients() {
  const { data, error } = await client.from('patients').select('id, first_name, surname, upi, phone, dob, sex');
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

// ---------- Cart of tests ----------
els.addTestBtn.addEventListener('click', () => {
  const name = els.testName.value.trim();
  if (!name) {
    els.requestStatus.textContent = 'Enter a test name first.';
    els.requestStatus.className = 'form-status err';
    return;
  }
  cart.push({ testName: name, sampleType: els.sampleType.value.trim() });
  els.testName.value = '';
  els.sampleType.value = '';
  els.requestStatus.textContent = '';
  renderCart();
});

function renderCart() {
  if (!cart.length) {
    els.cartItems.innerHTML = `<p class="empty-state small">No tests added yet.</p>`;
    return;
  }
  els.cartItems.innerHTML = cart.map((t, i) => `
    <div class="doc-entry">
      <div>
        <div class="doc-name">${t.testName}</div>
        <div class="med-meta">${t.sampleType || 'sample n/a'}</div>
      </div>
      <button class="btn-ghost btn-small remove-cart-test" data-index="${i}">Remove</button>
    </div>
  `).join('');

  els.cartItems.querySelectorAll('.remove-cart-test').forEach(btn => {
    btn.addEventListener('click', () => {
      cart.splice(Number(btn.dataset.index), 1);
      renderCart();
    });
  });
}

// ---------- Payment / change ----------
els.amountReceived.addEventListener('input', updateChange);
els.amountCharged.addEventListener('input', updateChange);

function updateChange() {
  if (!els.amountReceived.value) { els.changeDisplay.textContent = ''; return; }
  const charged = Number(els.amountCharged.value) || 0;
  const received = Number(els.amountReceived.value) || 0;
  const change = received - charged;
  els.changeDisplay.textContent = change >= 0
    ? `Change due: UGX ${change.toLocaleString()}`
    : `Short by: UGX ${Math.abs(change).toLocaleString()}`;
  els.changeDisplay.className = change >= 0 ? 'form-status ok' : 'form-status err';
}

// ---------- Submit order ----------
els.requestBtn.addEventListener('click', async () => {
  const isWalkin = els.customerType.value === 'walkin';
  const patientId = isWalkin ? null : (els.patientIdField.value || null);
  const customerName = isWalkin ? els.walkinName.value.trim() : null;

  if (!isWalkin && !patientId) {
    els.requestStatus.textContent = 'Select a patient, or switch to Walk-in / one-time test.';
    els.requestStatus.className = 'form-status err';
    return;
  }
  if (!cart.length) {
    els.requestStatus.textContent = 'Add at least one test to the order.';
    els.requestStatus.className = 'form-status err';
    return;
  }

  els.requestStatus.textContent = 'Saving…';
  els.requestStatus.className = 'form-status';

  const charged = Number(els.amountCharged.value) || 0;
  const received = Number(els.amountReceived.value) || 0;
  const change = received - charged;

  const { data: order, error: orderErr } = await client.from('lab_orders').insert([{
    patient_id: patientId,
    customer_name: customerName,
    payment_method: els.paymentMethod.value,
    amount_charged: charged,
    amount_received: received,
    change_due: change > 0 ? change : 0,
  }]).select().single();

  if (orderErr) {
    els.requestStatus.textContent = `Couldn't save order: ${orderErr.message}`;
    els.requestStatus.className = 'form-status err';
    return;
  }

  for (const t of cart) {
    await client.from('lab_tests').insert([{
      patient_id: patientId,
      customer_name: customerName,
      test_name: t.testName,
      sample_type: t.sampleType,
      order_id: order.id,
    }]);
  }

  const customerLabel = isWalkin ? (customerName || 'Walk-in customer') : els.patientSearch.value;
  await showOrderReceipt(order, cart, customerLabel);

  els.requestStatus.textContent = 'Order submitted.';
  els.requestStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.amountCharged.value = '';
  els.amountReceived.value = '';
  els.changeDisplay.textContent = '';
  cart = [];
  renderCart();

  await loadPendingList();
});

async function showOrderReceipt(order, tests, customerLabel) {
  const header = await buildClinicHeaderHtml();
  els.receiptArea.innerHTML = `
    <div class="med-entry receipt-print-area" style="margin-top:14px; border:1px dashed var(--accent);">
      ${header}
      <div class="med-top"><span class="med-name">Lab Order Receipt</span><span class="med-meta">${new Date(order.created_at).toLocaleString()}</span></div>
      <div class="med-meta" style="margin-top:6px;">${customerLabel}</div>
      <div style="margin-top:8px;">
        ${tests.map(t => `<div class="consult-text">${t.testName}${t.sampleType ? ` (${t.sampleType})` : ''}</div>`).join('')}
      </div>
      ${order.amount_charged > 0 ? `
        <div class="med-meta" style="margin-top:8px; font-weight:600;">Amount: UGX ${order.amount_charged.toLocaleString()}</div>
        <div class="med-meta">Paid (${order.payment_method}): UGX ${order.amount_received.toLocaleString()}</div>
        ${order.change_due > 0 ? `<div class="med-meta">Change given: UGX ${order.change_due.toLocaleString()}</div>` : ''}
      ` : ''}
      <div class="signature-block">
        <div class="signature-line"><div class="line">Received by</div></div>
      </div>
    </div>
    <button type="button" class="btn-ghost btn-small no-print" id="print-lab-receipt-btn" style="margin-top:8px;">🖨 Print receipt</button>
  `;
  document.getElementById('print-lab-receipt-btn').addEventListener('click', () => window.print());
}

// ---------- Pending worklist (grouped by order) ----------
function groupTests(tests) {
  const groups = {};
  tests.forEach(t => {
    const key = t.order_id || `single-${t.id}`;
    if (!groups[key]) {
      groups[key] = {
        key,
        orderId: t.order_id,
        patientId: t.patient_id,
        customerName: t.customer_name,
        earliestDate: t.requested_at,
        tests: [],
      };
    }
    groups[key].tests.push(t);
    if (t.requested_at < groups[key].earliestDate) groups[key].earliestDate = t.requested_at;
  });
  return Object.values(groups).sort((a, b) => new Date(a.earliestDate) - new Date(b.earliestDate));
}

let pendingGroups = [];

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

  pendingGroups = groupTests(data);

  els.pendingList.innerHTML = pendingGroups.map(g => {
    const pat = patients.find(p => p.id === g.patientId);
    const label = pat ? `${pat.first_name} ${pat.surname}` : (g.customerName || 'Walk-in customer');
    const testNames = g.tests.map(t => t.test_name).join(', ');
    return `
      <div class="patient-row" data-key="${g.key}" style="cursor:pointer;">
        <div>
          <div class="pr-name">${label}</div>
          <div class="pr-meta">${g.tests.length} test${g.tests.length > 1 ? 's' : ''}: ${testNames} · ${new Date(g.earliestDate).toLocaleDateString()}</div>
        </div>
        <span>→</span>
      </div>
    `;
  }).join('');

  els.pendingList.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => renderResultForm(row.dataset.key));
  });
}

function renderResultForm(groupKey) {
  const g = pendingGroups.find(x => x.key === groupKey);
  if (!g) return;
  const pat = patients.find(p => p.id === g.patientId);
  const label = pat ? `${pat.first_name} ${pat.surname}` : (g.customerName || 'Walk-in customer');

  const container = els.pendingList;
  container.innerHTML = `
    <div class="vitals-form">
      <h4 style="margin:0 0 4px;">${label}</h4>
      ${g.tests.map((t, i) => `
        <div class="med-entry" style="margin-top:10px;">
          <div class="med-name">${t.test_name}${t.sample_type ? ` (${t.sample_type})` : ''}</div>
          <div class="edit-field" style="margin-top:8px;"><label>Result</label><input id="res-value-${i}" placeholder="e.g. Positive, 12.4 g/dL"></div>
          <div class="grid-2">
            <div class="edit-field"><label>Unit</label><input id="res-unit-${i}" placeholder="e.g. g/dL"></div>
            <div class="edit-field"><label>Reference range</label><input id="res-range-${i}" placeholder="e.g. 12-16 g/dL"></div>
            <div class="edit-field"><label>Flag</label>
              <select id="res-flag-${i}">
                <option value="normal">Normal</option>
                <option value="abnormal">Abnormal</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
        </div>
      `).join('')}
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-result-btn">Cancel</button>
        <button type="button" class="btn-primary" id="save-result-btn">Save all results</button>
      </div>
      <p class="form-status" id="result-status"></p>
    </div>
  `;

  document.getElementById('cancel-result-btn').addEventListener('click', loadPendingList);
  document.getElementById('save-result-btn').addEventListener('click', () => saveResults(g));
}

async function saveResults(g) {
  const statusEl = document.getElementById('result-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const now = new Date().toISOString();

  for (let i = 0; i < g.tests.length; i++) {
    const { error } = await client.from('lab_tests').update({
      result_value: document.getElementById(`res-value-${i}`).value.trim(),
      reference_range: document.getElementById(`res-range-${i}`).value.trim(),
      result_flag: document.getElementById(`res-flag-${i}`).value,
      status: 'completed',
      result_date: now,
    }).eq('id', g.tests[i].id);

    if (error) {
      statusEl.textContent = `Couldn't save one of the results: ${error.message}`;
      statusEl.className = 'form-status err';
      return;
    }
  }

  await loadPendingList();
  await loadCompletedList();
}

// ---------- Recently completed (grouped by order) ----------
let completedGroups = [];

async function loadCompletedList() {
  const { data, error } = await client
    .from('lab_tests')
    .select('*')
    .eq('status', 'completed')
    .order('result_date', { ascending: false })
    .limit(40);

  if (error) {
    els.completedList.innerHTML = `<p class="empty-state">Couldn't load results.</p>`;
    return;
  }
  if (!data.length) {
    els.completedList.innerHTML = `<p class="empty-state">No completed tests yet.</p>`;
    return;
  }

  completedGroups = groupTests(data).sort((a, b) => new Date(b.earliestDate) - new Date(a.earliestDate)).slice(0, 15);

  els.completedList.innerHTML = completedGroups.map(g => {
    const pat = patients.find(p => p.id === g.patientId);
    const label = pat ? `${pat.first_name} ${pat.surname}` : (g.customerName || 'Walk-in customer');
    const anyFlagged = g.tests.some(t => t.result_flag === 'critical' || t.result_flag === 'abnormal');
    const testNames = g.tests.map(t => t.test_name).join(', ');
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${label}</div>
          <div class="med-meta">${testNames}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${anyFlagged ? `<span class="vitals-chip vital-flag">flagged</span>` : ''}
          <button class="btn-ghost btn-small print-result-btn" data-key="${g.key}">🖨</button>
        </div>
      </div>
    `;
  }).join('');

  els.completedList.querySelectorAll('.print-result-btn').forEach(btn => {
    btn.addEventListener('click', () => printLabResult(btn.dataset.key));
  });
}

async function printLabResult(groupKey) {
  const g = completedGroups.find(x => x.key === groupKey);
  if (!g) return;
  const pat = patients.find(p => p.id === g.patientId);
  const header = await buildClinicHeaderHtml();
  const latestResultDate = g.tests.reduce((latest, t) =>
    (!latest || new Date(t.result_date) > new Date(latest)) ? t.result_date : latest, null);

  const patientBlock = pat ? `
    <div class="med-meta">Patient: ${pat.first_name} ${pat.surname} (${pat.upi})</div>
    <div class="med-meta">Sex: ${pat.sex || '—'} · DOB: ${pat.dob || '—'}</div>
  ` : `<div class="med-meta">Patient: ${g.customerName || 'Walk-in customer'}</div>`;

  const rows = g.tests.map(t => `
    <tr>
      <td style="padding:4px 0;">${t.test_name}</td>
      <td>${t.sample_type || '—'}</td>
      <td>${t.result_value || '—'}</td>
      <td>${t.reference_range || '—'}</td>
      <td>${(t.result_flag || 'normal').toUpperCase()}</td>
    </tr>
  `).join('');

  els.receiptArea.innerHTML = `
    <div class="med-entry receipt-print-area" style="margin-top:14px; border:1px dashed var(--accent);">
      ${header}
      <div class="med-top"><span class="med-name">Laboratory Test Report</span></div>
      ${patientBlock}
      <div class="med-meta">Requested: ${new Date(g.earliestDate).toLocaleString()}</div>
      <div class="med-meta">Reported: ${latestResultDate ? new Date(latestResultDate).toLocaleString() : '—'}</div>

      <table style="width:100%; margin-top:12px; font-size:12.5px; border-collapse:collapse;">
        <tr style="border-bottom:1px solid var(--line); text-align:left;">
          <th style="padding:4px 0;">Test</th><th>Specimen</th><th>Result</th><th>Reference Range</th><th>Flag</th>
        </tr>
        ${rows}
      </table>

      <div class="signature-block">
        <div class="signature-line"><div class="line">Tested by</div></div>
        <div class="signature-line"><div class="line">Reviewed by</div></div>
      </div>
    </div>
    <button type="button" class="btn-ghost btn-small no-print" id="print-lab-result-btn" style="margin-top:8px;">🖨 Print result</button>
  `;
  document.getElementById('print-lab-result-btn').addEventListener('click', () => window.print());
  els.receiptArea.scrollIntoView({ behavior: 'smooth' });
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
