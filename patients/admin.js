// `client` is created by auth-guard.js, which loads before this file.

const ROLES = ['Admin', 'Clinician', 'Nurse', 'Pharmacist', 'Lab Tech', 'Radiographer', 'Cashier', 'Receptionist', 'HR Officer'];

const accountsList = document.getElementById('accounts-list');

async function checkConnection() {
  const { error } = await client.from('user_roles').select('user_id').limit(1);
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

async function loadAccounts() {
  const { data, error } = await client
    .from('user_roles')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    accountsList.innerHTML = `<p class="empty-state">Couldn't load accounts: ${error.message}</p>`;
    return;
  }
  if (!data.length) {
    accountsList.innerHTML = `<p class="empty-state">No staff have signed in yet.</p>`;
    return;
  }

  accountsList.innerHTML = data.map(u => `
    <div class="patient-row" style="cursor:default;">
      <div>
        <div class="pr-name">${u.full_name || u.email || 'Unnamed account'}</div>
        <div class="pr-meta">${u.email || ''}</div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <select class="role-select" data-user="${u.user_id}" style="width:auto;">
          ${ROLES.map(r => `<option ${u.role === r ? 'selected' : ''}>${r}</option>`).join('')}
        </select>
        <button class="btn-ghost btn-small save-role-btn" data-user="${u.user_id}">Save</button>
      </div>
    </div>
  `).join('');

  accountsList.querySelectorAll('.save-role-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const userId = btn.dataset.user;
      const select = accountsList.querySelector(`.role-select[data-user="${userId}"]`);
      const { error } = await client.from('user_roles').update({ role: select.value }).eq('user_id', userId);
      if (error) {
        alert(`Couldn't update role: ${error.message}`);
      } else {
        btn.textContent = 'Saved ✓';
        setTimeout(() => { btn.textContent = 'Save'; }, 1500);
      }
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
  await loadAccounts();
})();
