const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const form = document.getElementById('login-form');
const status = document.getElementById('login-status');
const btn = document.getElementById('login-btn');

// If already signed in, skip straight to the app
(async function checkExisting() {
  const { data: { session } } = await client.auth.getSession();
  if (session) window.location.href = 'index.html';
})();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  btn.disabled = true;
  status.textContent = 'Signing in…';
  status.className = 'login-status';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    status.textContent = 'Incorrect email or password.';
    status.className = 'login-status err';
    btn.disabled = false;
    return;
  }

  status.textContent = 'Signed in — loading…';
  status.className = 'login-status ok';
  window.location.href = 'index.html';
});
