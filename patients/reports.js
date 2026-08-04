// `client` is created by auth-guard.js, which loads before this file.

async function checkConnection() {
  const { error } = await client.from('patients').select('id').limit(1);
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

function setStat(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

async function loadStats() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { count: totalPatients },
    { count: todayCount },
    { count: pendingLab },
    { data: medicines },
    { count: activeMeds },
    { count: consultsWeek },
  ] = await Promise.all([
    client.from('patients').select('id', { count: 'exact', head: true }),
    client.from('patients').select('id', { count: 'exact', head: true }).gte('created_at', todayStart.toISOString()),
    client.from('lab_tests').select('id', { count: 'exact', head: true }).neq('status', 'completed'),
    client.from('medicines').select('stock_qty, reorder_level'),
    client.from('medications').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    client.from('consultations').select('id', { count: 'exact', head: true }).gte('recorded_at', weekAgo),
  ]);

  const lowStock = (medicines || []).filter(m => m.stock_qty <= m.reorder_level).length;

  setStat('stat-total-patients', totalPatients ?? 0);
  setStat('stat-today', todayCount ?? 0);
  setStat('stat-pending-lab', pendingLab ?? 0);
  setStat('stat-low-stock', lowStock);
  setStat('stat-active-meds', activeMeds ?? 0);
  setStat('stat-consults-week', consultsWeek ?? 0);
}

async function loadRecentConsults() {
  const el = document.getElementById('recent-consults');
  const { data, error } = await client
    .from('consultations')
    .select('*, patients(first_name, surname)')
    .order('recorded_at', { ascending: false })
    .limit(10);

  if (error || !data || !data.length) {
    el.innerHTML = `<p class="empty-state">No consultations recorded yet.</p>`;
    return;
  }

  el.innerHTML = data.map(c => `
    <div class="doc-entry">
      <div>
        <div class="doc-name">${c.patients ? `${c.patients.first_name} ${c.patients.surname}` : 'Unknown patient'}</div>
        <div class="med-meta">${c.diagnosis || c.chief_complaint || 'No diagnosis recorded'} · ${new Date(c.recorded_at).toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

async function loadRecentPatients() {
  const el = document.getElementById('recent-patients');
  const { data, error } = await client
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error || !data || !data.length) {
    el.innerHTML = `<p class="empty-state">No patients registered yet.</p>`;
    return;
  }

  el.innerHTML = data.map(p => `
    <div class="patient-row" style="cursor:default;">
      <div>
        <div class="pr-name">${p.first_name} ${p.surname}</div>
        <div class="pr-meta">${p.upi} · ${p.category || 'New Patient'} · ${new Date(p.created_at).toLocaleDateString()}</div>
      </div>
    </div>
  `).join('');
}

document.getElementById('signout-btn').addEventListener('click', async () => {
  await client.auth.signOut();
  window.location.href = 'login.html';
});

(async function init() {
  const user = await window.authReady;
  const userLabel = document.getElementById('user-email');
  if (userLabel && user) userLabel.textContent = user.email;

  await checkConnection();
  await loadStats();
  await loadRecentConsults();
  await loadRecentPatients();
})();
