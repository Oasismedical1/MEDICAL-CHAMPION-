// `client` is created by auth-guard.js, which loads before this file.

const els = {
  staffName: document.getElementById('staff-name'),
  staffRole: document.getElementById('staff-role'),
  staffPhone: document.getElementById('staff-phone'),
  staffEmail: document.getElementById('staff-email'),
  staffDate: document.getElementById('staff-date'),
  addStaffBtn: document.getElementById('add-staff-btn'),
  addStaffStatus: document.getElementById('add-staff-status'),
  staffList: document.getElementById('staff-list'),

  leaveStaff: document.getElementById('leave-staff'),
  leaveType: document.getElementById('leave-type'),
  leaveStart: document.getElementById('leave-start'),
  leaveEnd: document.getElementById('leave-end'),
  leaveReason: document.getElementById('leave-reason'),
  submitLeaveBtn: document.getElementById('submit-leave-btn'),
  leaveStatus: document.getElementById('leave-status'),
  leaveList: document.getElementById('leave-list'),

  attStaff: document.getElementById('att-staff'),
  attDate: document.getElementById('att-date'),
  attCheckin: document.getElementById('att-checkin'),
  attCheckout: document.getElementById('att-checkout'),
  saveAttendanceBtn: document.getElementById('save-attendance-btn'),
  attendanceStatus: document.getElementById('attendance-status'),
  attendanceList: document.getElementById('attendance-list'),
};

let staff = [];

// ---------- Connection ----------
async function checkConnection() {
  const { error } = await client.from('staff_members').select('id').limit(1);
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

// ---------- Staff directory ----------
els.addStaffBtn.addEventListener('click', async () => {
  const name = els.staffName.value.trim();
  if (!name) {
    els.addStaffStatus.textContent = 'Full name is required.';
    els.addStaffStatus.className = 'form-status err';
    return;
  }

  els.addStaffStatus.textContent = 'Saving…';
  els.addStaffStatus.className = 'form-status';

  const { error } = await client.from('staff_members').insert([{
    full_name: name,
    role: els.staffRole.value.trim(),
    phone: els.staffPhone.value.trim(),
    email: els.staffEmail.value.trim(),
    employment_date: els.staffDate.value || null,
  }]);

  if (error) {
    els.addStaffStatus.textContent = `Couldn't save: ${error.message}`;
    els.addStaffStatus.className = 'form-status err';
    return;
  }

  els.addStaffStatus.textContent = 'Staff member added.';
  els.addStaffStatus.className = 'form-status ok';
  els.staffName.value = '';
  els.staffRole.value = '';
  els.staffPhone.value = '';
  els.staffEmail.value = '';
  els.staffDate.value = '';

  await loadStaff();
});

async function loadStaff() {
  const { data, error } = await client
    .from('staff_members')
    .select('*')
    .eq('status', 'active')
    .order('full_name');

  if (error) {
    els.staffList.innerHTML = `<p class="empty-state">Couldn't load staff.</p>`;
    return;
  }
  staff = data || [];

  if (!staff.length) {
    els.staffList.innerHTML = `<p class="empty-state">No staff added yet.</p>`;
  } else {
    els.staffList.innerHTML = staff.map(s => `
      <div class="patient-row" style="cursor:default;">
        <div>
          <div class="pr-name">${s.full_name}</div>
          <div class="pr-meta">${s.role || 'Role n/a'}${s.phone ? ` · ${s.phone}` : ''}</div>
        </div>
      </div>
    `).join('');
  }

  const options = staff.map(s => `<option value="${s.id}">${s.full_name}${s.role ? ` (${s.role})` : ''}</option>`).join('');
  els.leaveStaff.innerHTML = options;
  els.attStaff.innerHTML = options;
}

// ---------- Leave requests ----------
els.submitLeaveBtn.addEventListener('click', async () => {
  const staffId = els.leaveStaff.value;
  if (!staffId) {
    els.leaveStatus.textContent = 'Add a staff member first.';
    els.leaveStatus.className = 'form-status err';
    return;
  }
  if (!els.leaveStart.value || !els.leaveEnd.value) {
    els.leaveStatus.textContent = 'Choose start and end dates.';
    els.leaveStatus.className = 'form-status err';
    return;
  }

  els.leaveStatus.textContent = 'Submitting…';
  els.leaveStatus.className = 'form-status';

  const { error } = await client.from('leave_requests').insert([{
    staff_id: staffId,
    leave_type: els.leaveType.value,
    start_date: els.leaveStart.value,
    end_date: els.leaveEnd.value,
    reason: els.leaveReason.value.trim(),
  }]);

  if (error) {
    els.leaveStatus.textContent = `Couldn't submit: ${error.message}`;
    els.leaveStatus.className = 'form-status err';
    return;
  }

  els.leaveStatus.textContent = 'Leave request submitted.';
  els.leaveStatus.className = 'form-status ok';
  els.leaveStart.value = '';
  els.leaveEnd.value = '';
  els.leaveReason.value = '';

  await loadLeaveRequests();
});

async function loadLeaveRequests() {
  const { data, error } = await client
    .from('leave_requests')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    els.leaveList.innerHTML = `<p class="empty-state">Couldn't load leave requests.</p>`;
    return;
  }
  if (!data.length) {
    els.leaveList.innerHTML = `<p class="empty-state">No leave requests yet.</p>`;
    return;
  }

  els.leaveList.innerHTML = data.map(l => {
    const s = staff.find(x => x.id === l.staff_id);
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${s ? s.full_name : 'Unknown staff'} — ${l.leave_type}</div>
          <div class="med-meta">${l.start_date} → ${l.end_date}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="med-status ${l.status === 'approved' ? 'med-status-completed' : (l.status === 'rejected' ? 'med-status-stopped' : 'med-status-active')}">${l.status}</span>
          ${l.status === 'pending' ? `
            <button class="btn-ghost btn-small leave-approve-btn" data-id="${l.id}">Approve</button>
            <button class="btn-ghost btn-small leave-reject-btn" data-id="${l.id}">Reject</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  els.leaveList.querySelectorAll('.leave-approve-btn').forEach(btn => {
    btn.addEventListener('click', () => updateLeaveStatus(btn.dataset.id, 'approved'));
  });
  els.leaveList.querySelectorAll('.leave-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => updateLeaveStatus(btn.dataset.id, 'rejected'));
  });
}

async function updateLeaveStatus(id, status) {
  await client.from('leave_requests').update({ status }).eq('id', id);
  await loadLeaveRequests();
}

// ---------- Attendance ----------
els.saveAttendanceBtn.addEventListener('click', async () => {
  const staffId = els.attStaff.value;
  if (!staffId) {
    els.attendanceStatus.textContent = 'Add a staff member first.';
    els.attendanceStatus.className = 'form-status err';
    return;
  }

  els.attendanceStatus.textContent = 'Saving…';
  els.attendanceStatus.className = 'form-status';

  const { error } = await client.from('attendance_log').insert([{
    staff_id: staffId,
    attendance_date: els.attDate.value || new Date().toISOString().slice(0, 10),
    check_in: els.attCheckin.value || null,
    check_out: els.attCheckout.value || null,
  }]);

  if (error) {
    els.attendanceStatus.textContent = `Couldn't save: ${error.message}`;
    els.attendanceStatus.className = 'form-status err';
    return;
  }

  els.attendanceStatus.textContent = 'Attendance saved.';
  els.attendanceStatus.className = 'form-status ok';
  els.attDate.value = '';
  els.attCheckin.value = '';
  els.attCheckout.value = '';

  await loadAttendance();
});

async function loadAttendance() {
  const { data, error } = await client
    .from('attendance_log')
    .select('*')
    .order('attendance_date', { ascending: false })
    .limit(20);

  if (error) {
    els.attendanceList.innerHTML = `<p class="empty-state">Couldn't load attendance.</p>`;
    return;
  }
  if (!data.length) {
    els.attendanceList.innerHTML = `<p class="empty-state">No attendance recorded yet.</p>`;
    return;
  }

  els.attendanceList.innerHTML = data.map(a => {
    const s = staff.find(x => x.id === a.staff_id);
    return `
      <div class="doc-entry">
        <div>
          <div class="doc-name">${s ? s.full_name : 'Unknown staff'}</div>
          <div class="med-meta">${a.attendance_date} · ${a.check_in || '—'} → ${a.check_out || '—'}</div>
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
  await loadStaff();
  await loadLeaveRequests();
  await loadAttendance();
})();
