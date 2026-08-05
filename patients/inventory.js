// `client` is created by auth-guard.js, which loads before this file.

const els = {
  addItemBtn: document.getElementById('add-item-btn'),
  addItemForm: document.getElementById('add-item-form'),
  inventoryList: document.getElementById('inventory-list'),
  issueItem: document.getElementById('issue-item'),
  issueQty: document.getElementById('issue-qty'),
  issueDept: document.getElementById('issue-dept'),
  issueTo: document.getElementById('issue-to'),
  issuePurpose: document.getElementById('issue-purpose'),
  issueBtn: document.getElementById('issue-btn'),
  issueStatus: document.getElementById('issue-status'),
  issuesLog: document.getElementById('issues-log'),
};

let items = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('inventory_items').select('id').limit(1);
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

// ---------- Items ----------
async function loadItems() {
  const { data, error } = await client.from('inventory_items').select('*').order('name');
  if (error) {
    els.inventoryList.innerHTML = `<p class="empty-state">Couldn't load inventory.</p>`;
    return;
  }
  items = data || [];
  renderItemList();
  renderIssueDropdown();
}

function renderItemList() {
  if (!items.length) {
    els.inventoryList.innerHTML = `<p class="empty-state">No items added yet.</p>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);

  els.inventoryList.innerHTML = items.map(i => {
    const low = i.quantity <= i.reorder_level;
    const expiringSoon = i.expiry_date && i.expiry_date < new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    const expired = i.expiry_date && i.expiry_date < today;
    return `
      <div class="patient-row" style="cursor:default;">
        <div>
          <div class="pr-name">${i.name}</div>
          <div class="pr-meta">${i.category || 'Uncategorized'} · stock: ${i.quantity} ${i.unit || ''}${low ? ' ⚠ low' : ''}${i.expiry_date ? ` · exp: ${i.expiry_date}${expired ? ' (EXPIRED)' : (expiringSoon ? ' (soon)' : '')}` : ''}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderIssueDropdown() {
  els.issueItem.innerHTML = items
    .map(i => `<option value="${i.id}">${i.name} (stock: ${i.quantity})</option>`)
    .join('');
}

els.addItemBtn.addEventListener('click', () => {
  els.addItemForm.innerHTML = `
    <div class="vitals-form">
      <div class="grid-2">
        <div class="edit-field"><label>Name *</label><input id="new-item-name"></div>
        <div class="edit-field"><label>Category</label>
          <select id="new-item-category">
            <option>Medical Supplies</option>
            <option>Laboratory Consumables</option>
            <option>Radiology Consumables</option>
            <option>Office Supplies</option>
            <option>Maintenance Supplies</option>
            <option>Other</option>
          </select>
        </div>
        <div class="edit-field"><label>Unit</label><input id="new-item-unit" placeholder="e.g. box, pack, piece"></div>
        <div class="edit-field"><label>Starting quantity</label><input type="number" id="new-item-qty" value="0"></div>
        <div class="edit-field"><label>Reorder level</label><input type="number" id="new-item-reorder" value="10"></div>
        <div class="edit-field"><label>Expiry date (optional)</label><input type="date" id="new-item-expiry"></div>
        <div class="edit-field"><label>Supplier</label><input id="new-item-supplier"></div>
        <div class="edit-field"><label>Unit cost (UGX)</label><input type="number" id="new-item-cost"></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn-ghost" id="cancel-item-add">Cancel</button>
        <button type="button" class="btn-primary" id="save-item-add">Save item</button>
      </div>
      <p class="form-status" id="item-add-status"></p>
    </div>
  `;
  document.getElementById('cancel-item-add').addEventListener('click', () => els.addItemForm.innerHTML = '');
  document.getElementById('save-item-add').addEventListener('click', saveNewItem);
});

async function saveNewItem() {
  const statusEl = document.getElementById('item-add-status');
  const name = document.getElementById('new-item-name').value.trim();
  if (!name) {
    statusEl.textContent = 'Name is required.';
    statusEl.className = 'form-status err';
    return;
  }
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  const record = {
    name,
    category: document.getElementById('new-item-category').value,
    unit: document.getElementById('new-item-unit').value.trim(),
    quantity: Number(document.getElementById('new-item-qty').value) || 0,
    reorder_level: Number(document.getElementById('new-item-reorder').value) || 10,
    expiry_date: document.getElementById('new-item-expiry').value || null,
    supplier: document.getElementById('new-item-supplier').value.trim(),
    unit_cost: Number(document.getElementById('new-item-cost').value) || 0,
  };

  const { error } = await client.from('inventory_items').insert([record]);
  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  els.addItemForm.innerHTML = '';
  await loadItems();
}

// ---------- Issue stock ----------
els.issueBtn.addEventListener('click', async () => {
  const itemId = els.issueItem.value;
  const qty = Number(els.issueQty.value);
  const item = items.find(i => i.id === itemId);

  if (!item) {
    els.issueStatus.textContent = 'Add an item first.';
    els.issueStatus.className = 'form-status err';
    return;
  }
  if (!qty || qty < 1) {
    els.issueStatus.textContent = 'Enter a valid quantity.';
    els.issueStatus.className = 'form-status err';
    return;
  }
  if (qty > item.quantity) {
    els.issueStatus.textContent = `Not enough stock — only ${item.quantity} left.`;
    els.issueStatus.className = 'form-status err';
    return;
  }

  els.issueStatus.textContent = 'Issuing…';
  els.issueStatus.className = 'form-status';

  const { error: issueErr } = await client.from('stock_issues').insert([{
    item_id: itemId,
    quantity: qty,
    department: els.issueDept.value,
    issued_to: els.issueTo.value.trim(),
    purpose: els.issuePurpose.value.trim(),
  }]);

  if (issueErr) {
    els.issueStatus.textContent = `Couldn't issue: ${issueErr.message}`;
    els.issueStatus.className = 'form-status err';
    return;
  }

  await client.from('inventory_items').update({ quantity: item.quantity - qty }).eq('id', itemId);

  els.issueStatus.textContent = `Issued ${qty} × ${item.name}.`;
  els.issueStatus.className = 'form-status ok';
  els.issueTo.value = '';
  els.issuePurpose.value = '';
  els.issueQty.value = 1;

  await loadItems();
  await loadIssuesLog();
});

// ---------- Recent issues ----------
async function loadIssuesLog() {
  const { data, error } = await client
    .from('stock_issues')
    .select('*')
    .order('issued_at', { ascending: false })
    .limit(15);

  if (error) {
    els.issuesLog.innerHTML = `<p class="empty-state">Couldn't load issue log.</p>`;
    return;
  }
  if (!data.length) {
    els.issuesLog.innerHTML = `<p class="empty-state">No stock issued yet.</p>`;
    return;
  }

  els.issuesLog.innerHTML = data.map(s => {
    const item = items.find(i => i.id === s.item_id);
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${item ? item.name : 'Unknown item'} × ${s.quantity}</div>
          <div class="med-meta">${s.department || 'Dept n/a'}${s.issued_to ? ` → ${s.issued_to}` : ''} · ${new Date(s.issued_at).toLocaleDateString()}</div>
        </div>
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
  await loadItems();
  await loadIssuesLog();
})();
