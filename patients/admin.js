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

// ---------- Clinic settings ----------
async function loadClinicSettings() {
  const settings = await fetchClinicSettings();
  document.getElementById('clinic-name').value = settings.clinic_name || '';
  document.getElementById('clinic-address').value = settings.address || '';
  document.getElementById('clinic-phone').value = settings.phone || '';

  const preview = document.getElementById('clinic-logo-preview');
  const url = clinicLogoUrl(settings.logo_path);
  preview.innerHTML = url ? `<img src="${url}" alt="Current logo" style="max-height:60px;">` : '';
}

document.getElementById('save-clinic-btn').addEventListener('click', async () => {
  const statusEl = document.getElementById('clinic-save-status');
  statusEl.textContent = 'Saving…';
  statusEl.className = 'form-status';

  let logoPath = null;
  const file = document.getElementById('clinic-logo-input').files[0];
  if (file) {
    logoPath = `logo-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: uploadErr } = await client.storage.from('clinic-assets').upload(logoPath, file, { upsert: true });
    if (uploadErr) {
      statusEl.textContent = `Couldn't upload logo: ${uploadErr.message}`;
      statusEl.className = 'form-status err';
      return;
    }
  }

  const update = {
    clinic_name: document.getElementById('clinic-name').value.trim(),
    address: document.getElementById('clinic-address').value.trim(),
    phone: document.getElementById('clinic-phone').value.trim(),
  };
  if (logoPath) update.logo_path = logoPath;

  const { error } = await client.from('clinic_settings').update(update).eq('id', 1);

  if (error) {
    statusEl.textContent = `Couldn't save: ${error.message}`;
    statusEl.className = 'form-status err';
    return;
  }

  statusEl.textContent = 'Saved.';
  statusEl.className = 'form-status ok';
  await loadClinicSettings();
});

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
  await loadClinicSettings();
})();
