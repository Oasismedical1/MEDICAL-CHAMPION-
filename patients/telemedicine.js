// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('tm-patient-search'),
  patientResults: document.getElementById('tm-patient-results'),
  patientIdField: document.getElementById('tm-patient-id'),
  selectedPatientLabel: document.getElementById('tm-selected-patient'),
  date: document.getElementById('tm-date'),
  time: document.getElementById('tm-time'),
  scheduleBtn: document.getElementById('tm-schedule-btn'),
  scheduleStatus: document.getElementById('tm-schedule-status'),
  upcomingList: document.getElementById('tm-upcoming-list'),
  pastList: document.getElementById('tm-past-list'),
};

let patients = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('telemedicine_sessions').select('id').limit(1);
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

function generateRoomId(patientId) {
  const short = patientId.replace(/-/g, '').slice(0, 8);
  return `MedicalChampion-${short}-${Date.now()}`;
}

// ---------- Schedule session ----------
els.scheduleBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  const date = els.date.value;
  const time = els.time.value;

  if (!patientId) {
    els.scheduleStatus.textContent = 'Select a patient first.';
    els.scheduleStatus.className = 'form-status err';
    return;
  }
  if (!date || !time) {
    els.scheduleStatus.textContent = 'Choose a date and time.';
    els.scheduleStatus.className = 'form-status err';
    return;
  }

  els.scheduleStatus.textContent = 'Scheduling…';
  els.scheduleStatus.className = 'form-status';

  const { error } = await client.from('telemedicine_sessions').insert([{
    patient_id: patientId,
    scheduled_time: new Date(`${date}T${time}`).toISOString(),
    room_id: generateRoomId(patientId),
  }]);

  if (error) {
    els.scheduleStatus.textContent = `Couldn't schedule: ${error.message}`;
    els.scheduleStatus.className = 'form-status err';
    return;
  }

  els.scheduleStatus.textContent = 'Session scheduled.';
  els.scheduleStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.date.value = '';
  els.time.value = '';

  await loadUpcoming();
});

// ---------- Upcoming sessions ----------
async function loadUpcoming() {
  const { data, error } = await client
    .from('telemedicine_sessions')
    .select('*')
    .eq('status', 'scheduled')
    .order('scheduled_time', { ascending: true });

  if (error) {
    els.upcomingList.innerHTML = `<p class="empty-state">Couldn't load sessions.</p>`;
    return;
  }
  if (!data.length) {
    els.upcomingList.innerHTML = `<p class="empty-state">No upcoming sessions.</p>`;
    return;
  }

  els.upcomingList.innerHTML = data.map(s => {
    const pat = patients.find(p => p.id === s.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    const link = `https://meet.jit.si/${s.room_id}`;
    return `
      <div class="patient-row" style="cursor:default; align-items:flex-start;">
        <div>
          <div class="pr-name">${name}</div>
          <div class="pr-meta">${new Date(s.scheduled_time).toLocaleString()}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          <a href="${link}" target="_blank" class="btn-primary btn-small" style="text-decoration:none; display:inline-block;">Join call</a>
          <button class="btn-ghost btn-small tm-complete-btn" data-id="${s.id}">Mark completed</button>
          <button class="btn-ghost btn-small tm-cancel-btn" data-id="${s.id}">Cancel</button>
        </div>
      </div>
    `;
  }).join('');

  els.upcomingList.querySelectorAll('.tm-complete-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'completed'));
  });
  els.upcomingList.querySelectorAll('.tm-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => updateStatus(btn.dataset.id, 'cancelled'));
  });
}

async function updateStatus(sessionId, status) {
  await client.from('telemedicine_sessions').update({ status }).eq('id', sessionId);
  await loadUpcoming();
  await loadPast();
}

// ---------- Past sessions ----------
async function loadPast() {
  const { data, error } = await client
    .from('telemedicine_sessions')
    .select('*')
    .neq('status', 'scheduled')
    .order('scheduled_time', { ascending: false })
    .limit(15);

  if (error) {
    els.pastList.innerHTML = `<p class="empty-state">Couldn't load past sessions.</p>`;
    return;
  }
  if (!data.length) {
    els.pastList.innerHTML = `<p class="empty-state">No past sessions yet.</p>`;
    return;
  }

  els.pastList.innerHTML = data.map(s => {
    const pat = patients.find(p => p.id === s.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${name}</div>
          <div class="med-meta">${new Date(s.scheduled_time).toLocaleString()}</div>
        </div>
        <span class="med-status ${s.status === 'completed' ? 'med-status-completed' : 'med-status-stopped'}">${s.status}</span>
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
  await loadUpcoming();
  await loadPast();
})();
