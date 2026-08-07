// Shared Supabase client — used by both this guard and app.js
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Holds the signed-in user and their role once confirmed; app.js waits on this.
window.currentUser = null;
window.currentUserRole = null;

window.authReady = (async function guard() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    return new Promise(() => {});
  }

  window.currentUser = session.user;

  // ---------- Look up (or create) this user's role ----------
  let role = 'Clinician'; // safe default for any brand-new account
  const { data: existing } = await client
    .from('user_roles')
    .select('role')
    .eq('user_id', session.user.id)
    .maybeSingle();

  if (existing) {
    role = existing.role;
  } else {
    await client.from('user_roles').insert([{
      user_id: session.user.id,
      email: session.user.email,
      role: 'Clinician',
    }]);
  }
  window.currentUserRole = role;

  // ---------- Hide nav items / elements this role shouldn't see ----------
  document.querySelectorAll('[data-roles]').forEach(el => {
    const allowed = el.getAttribute('data-roles').split(',').map(s => s.trim());
    if (!allowed.includes(role)) el.style.display = 'none';
  });

  // ---------- Block the whole page if this role isn't allowed here ----------
  const pageRoles = document.body.getAttribute('data-page-roles');
  if (pageRoles) {
    const allowed = pageRoles.split(',').map(s => s.trim());
    if (!allowed.includes(role)) {
      alert("You don't have permission to view this page.");
      window.location.href = 'index.html';
      return new Promise(() => {});
    }
  }

  return session.user;
})();
