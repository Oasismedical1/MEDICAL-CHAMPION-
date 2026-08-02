// ---------- Setup ----------
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const els = {
  form: document.getElementById('patient-form'),
  status: document.getElementById('form-status'),
  upiPreview: document.getElementById('upi-preview'),
  list: document.getElementById('patient-list'),
  search: document.getElementById('search'),
  count: document.getElementById('patient-count'),
  connDot: document.getElementById('conn-dot'),
  connLabel: document.getElementById('conn-label'),
  drawer: document.getElementById('drawer'),
  drawerContent: document.getElementById('drawer-content'),
  drawerClose: document.getElementById('drawer-close'),
  resetBtn: document.getElementById('reset-btn'),
};

let allPatients = [];

// ---------- UPI generation: UGM-<DISTRICT3>-<YEAR>-<SEQ> ----------
function districtCode(district) {
  return (district || 'SRT').trim().slice(0, 3).toUpperCase() || 'SRT';
}

function nextUpi(count, district) {
  const year = new Date().getFullYear();
  const seq = String(count + 1).padStart(6, '0');
  return `UGM-${districtCode(district)}-${year}-${seq}`;
}

// ---------- Connection check ----------
async function checkConnection() {
  if (SUPABASE_URL.includes('YOUR_SUPABASE')) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Not connected — edit config.js';
    return false;
  }
  const { error } = await client.from('patients').select('id').limit(1);
  if (error) {
    els.connDot.className = 'dot offline';
    els.connLabel.textContent = 'Connection error — check config.js';
    return false;
  }
  els.connDot.className = 'dot online';
  els.connLabel.textContent = 'Connected';
  return true;
}

// ---------- Load & render patients ----------
async function loadPatients() {
  const { data, error } = await client
    .from('patients')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    els.list.innerHTML = `<p class="empty-state">Couldn't load patients. Check your Supabase connection in config.js.</p>`;
    return;
  }

  allPatients = data || [];
  els.count.textContent = allPatients.length;
  els.upiPreview.textContent = nextUpi(allPatients.length, document.getElementById('district').value);
  renderList(allPatients);
}

function renderList(patients) {
  if (!patients.length) {
    els.list.innerHTML = `<p class="empty-state">No patients yet. The first registration will appear here.</p>`;
    return;
  }
  els.list.innerHTML = patients.map(p => `
    <div class="patient-row" data-id="${p.id}">
      <div>
        <div class="pr-name">${p.first_name} ${p.surname}</div>
        <div class="pr-meta">${p.upi} · ${p.sex || '—'} · ${p.phone || 'no phone'}</div>
      </div>
      <span>→</span>
    </div>
  `).join('');

  els.list.querySelectorAll('.patient-row').forEach(row => {
    row.addEventListener('click', () => openDrawer(row.dataset.id));
  });
}

// ---------- Search ----------
els.search.addEventListener('input', () => {
  const q = els.search.value.trim().toLowerCase();
  if (!q) return renderList(allPatients);
  const filtered = allPatients.filter(p =>
    `${p.first_name} ${p.surname}`.toLowerCase().includes(q) ||
    (p.upi || '').toLowerCase().includes(q) ||
    (p.phone || '').includes(q)
  );
  renderList(filtered);
});

// ---------- Register patient ----------
els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.status.textContent = 'Saving…';
  els.status.className = 'form-status';

  const record = {
    upi: nextUpi(allPatients.length, document.getElementById('district').value),
    first_name: val('first_name'),
    middle_name: val('middle_name'),
    surname: val('surname'),
    sex: val('sex'),
    dob: val('dob') || null,
    nin: val('nin'),
    phone: val('phone'),
    village: val('village'),
    subcounty: val('subcounty'),
    district: val('district'),
    ec_name: val('ec_name'),
    ec_phone: val('ec_phone'),
    blood_group: val('blood_group'),
    allergies: val('allergies'),
    chronic_conditions: val('chronic'),
  };

  const { error } = await client.from('patients').insert([record]);

  if (error) {
    els.status.textContent = `Couldn't save: ${error.message}`;
    els.status.className = 'form-status err';
    return;
  }

  els.status.textContent = `Registered — UPI ${record.upi}`;
  els.status.className = 'form-status ok';
  els.form.reset();
  document.getElementById('district').value = 'Soroti';
  loadPatients();
});

els.resetBtn.addEventListener('click', () => {
  els.form.reset();
  document.getElementById('district').value = 'Soroti';
  els.status.textContent = '';
});

function val(id) {
  return document.getElementById(id).value.trim();
}

// ---------- Detail drawer ----------
function openDrawer(id) {
  const p = allPatients.find(x => String(x.id) === String(id));
  if (!p) return;

  const allergyTag = p.allergies
    ? `<span class="tag-danger">⚠ Allergy: ${p.allergies}</span>`
    : '';

  els.drawerContent.innerHTML = `
    <h3>${p.first_name} ${p.middle_name || ''} ${p.surname}</h3>
    <div class="drawer-upi">${p.upi}</div>
    ${allergyTag}
    <dl>
      <dt>Sex / DOB</dt><dd>${p.sex || '—'} · ${p.dob || 'not recorded'}</dd>
      <dt>Phone</dt><dd>${p.phone || '—'}</dd>
      <dt>Location</dt><dd>${[p.village, p.subcounty, p.district].filter(Boolean).join(', ') || '—'}</dd>
      <dt>National ID</dt><dd>${p.nin || '—'}</dd>
      <dt>Emergency contact</dt><dd>${p.ec_name ? `${p.ec_name} (${p.ec_phone || 'no phone'})` : '—'}</dd>
      <dt>Blood group</dt><dd>${p.blood_group || 'Unknown'}</dd>
      <dt>Chronic conditions</dt><dd>${p.chronic_conditions || 'None recorded'}</dd>
      <dt>Registered</dt><dd>${new Date(p.created_at).toLocaleDateString()}</dd>
    </dl>
  `;
  els.drawer.classList.add('open');
}

els.drawerClose.addEventListener('click', () => els.drawer.classList.remove('open'));

// ---------- Init ----------
(async function init() {
  const connected = await checkConnection();
  if (connected) await loadPatients();
  else els.upiPreview.textContent = nextUpi(0, 'Soroti');
})();
