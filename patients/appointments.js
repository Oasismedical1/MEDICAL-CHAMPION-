// `client` is created by auth-guard.js, which loads before this file.

const els = {
  patientSearch: document.getElementById('appt-patient-search'),
  patientResults: document.getElementById('appt-patient-results'),
  patientIdField: document.getElementById('appt-patient-id'),
  selectedPatientLabel: document.getElementById('appt-selected-patient'),
  date: document.getElementById('appt-date'),
  time: document.getElementById('appt-time'),
  type: document.getElementById('appt-type'),
  priority: document.getElementById('appt-priority'),
  notes: document.getElementById('appt-notes'),
  bookBtn: document.getElementById('appt-book-btn'),
  bookStatus: document.getElementById('appt-book-status'),
  queueList: document.getElementById('queue-list'),
  upcomingList: document.getElementById('upcoming-list'),
  queueDateLabel: document.getElementById('queue-date-label'),
};

let patients = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('appointments').select('id').limit(1);
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

// ---------- Book appointment ----------
els.bookBtn.addEventListener('click', async () => {
  const patientId = els.patientIdField.value;
  const date = els.date.value;
  const time = els.time.value;

  if (!patientId) {
    els.bookStatus.textContent = 'Select a patient first.';
    els.bookStatus.className = 'form-status err';
    return;
  }
  if (!date || !time) {
    els.bookStatus.textContent = 'Choose a date and time.';
    els.bookStatus.className = 'form-status err';
    return;
  }

  els.bookStatus.textContent = 'Booking…';
  els.bookStatus.className = 'form-status';

  const { error } = await client.from('appointments').insert([{
    patient_id: patientId,
    appointment_time: new Date(`${date}T${time}`).toISOString(),
    visit_type: els.type.value.trim(),
    priority: els.priority.value,
    notes: els.notes.value.trim(),
  }]);

  if (error) {
    els.bookStatus.textContent = `Couldn't book: ${error.message}`;
    els.bookStatus.className = 'form-status err';
    return;
  }

  els.bookStatus.textContent = 'Appointment booked.';
  els.bookStatus.className = 'form-status ok';
  els.patientSearch.value = '';
  els.patientIdField.value = '';
  els.selectedPatientLabel.textContent = '';
  els.date.value = '';
  els.time.value = '';
  els.type.value = '';
  els.notes.value = '';

  await loadQueue();
  await loadUpcoming();
});

// ---------- Today's queue ----------
function todayRange() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

const STATUS_FLOW = {
  'booked': { next: 'checked-in', label: 'Check in' },
  'checked-in': { next: 'in-consultation', label: 'Start consultation' },
  'in-consultation': { next: 'completed', label: 'Complete' },
};

async function loadQueue() {
  const { start, end } = todayRange();
  els.queueDateLabel.textContent = new Date().toLocaleDateString();

  const { data, error } = await client
    .from('appointments')
    .select('*')
    .gte('appointment_time', start)
    .lte('appointment_time', end)
    .order('appointment_time', { ascending: true });

  if (error) {
    els.queueList.innerHTML = `<p class="empty-state">Couldn't load today's queue.</p>`;
    return;
  }
  if (!data.length) {
    els.queueList.innerHTML = `<p class="empty-state">No appointments booked for today.</p>`;
    return;
  }

  els.queueList.innerHTML = data.map(a => {
    const pat = patients.find(p => p.id === a.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    const time = new Date(a.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const action = STATUS_FLOW[a.status];
    const isTerminal = a.status === 'completed' || a.status === 'cancelled' || a.status === 'missed';

    return `
      <div class="patient-row" style="cursor:default; align-items:flex-start;">
        <div>
          <div class="pr-name">${time} — ${name} ${a.priority !== 'normal' ? `<span class="med-status med-status-stopped" style="background:#FBEAE8;color:var(--danger);">${a.priority}</span>` : ''}</div>
          <div class="pr-meta">${a.visit_type || 'Visit'} · <span class="med-status med-status-active">${a.status}</span></div>
        </div>
        <div style="display:flex; flex-direction:column; gap:6px; align-items:flex-end;">
          ${action ? `<button class="btn-ghost btn-small queue-action" data-id="${a.id}" data-next="${action.next}" data-patient="${a.patient_id}">${action.label}</button>` : ''}
          ${!isTerminal ? `<button class="btn-ghost btn-small queue-cancel" data-id="${a.id}">Cancel</button>` : ''}
        </div>
      </div>
    `;
  }).join('');

  els.queueList.querySelectorAll('.queue-action').forEach(btn => {
    btn.addEventListener('click', async () => {
      await client.from('appointments').update({ status: btn.dataset.next }).eq('id', btn.dataset.id);
      if (btn.dataset.next === 'in-consultation') {
        window.location.href = `index.html?patient=${btn.dataset.patient}`;
        return;
      }
      await loadQueue();
    });
  });

  els.queueList.querySelectorAll('.queue-cancel').forEach(btn => {
    btn.addEventListener('click', async () => {
      await client.from('appointments').update({ status: 'cancelled' }).eq('id', btn.dataset.id);
      await loadQueue();
    });
  });
}

// ---------- Upcoming (future, not today) ----------
async function loadUpcoming() {
  const { end } = todayRange();

  const { data, error } = await client
    .from('appointments')
    .select('*')
    .gt('appointment_time', end)
    .order('appointment_time', { ascending: true })
    .limit(15);

  if (error) {
    els.upcomingList.innerHTML = `<p class="empty-state">Couldn't load upcoming appointments.</p>`;
    return;
  }
  if (!data.length) {
    els.upcomingList.innerHTML = `<p class="empty-state">No upcoming appointments booked.</p>`;
    return;
  }

  els.upcomingList.innerHTML = data.map(a => {
    const pat = patients.find(p => p.id === a.patient_id);
    const name = pat ? `${pat.first_name} ${pat.surname}` : 'Unknown patient';
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${name}</div>
          <div class="med-meta">${a.visit_type || 'Visit'} · ${new Date(a.appointment_time).toLocaleString()}</div>
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
  await loadPatients();
  await loadQueue();
  await loadUpcoming();
})();
