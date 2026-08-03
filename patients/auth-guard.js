// Shared Supabase client — used by both this guard and app.js
const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Holds the signed-in user once confirmed; app.js waits on this.
window.currentUser = null;

window.authReady = (async function guard() {
  const { data: { session } } = await client.auth.getSession();

  if (!session) {
    window.location.href = 'login.html';
    // Return a promise that never resolves — the redirect is already happening,
    // this just prevents app.js from trying to run against a missing session.
    return new Promise(() => {});
  }

  window.currentUser = session.user;
  return session.user;
})();
