/* ─── Auth State Management ──────────────────────────────────────────── */

let _currentUser = null;
let _token = localStorage.getItem('token');

function authGetUser() { return _currentUser; }
function authGetToken() { return _token; }
function authIsAuthenticated() { return !!_token; }

async function authFetchProfile() {
  if (!_token) return;
  try {
    const data = await apiGet('/auth/profile');
    _currentUser = data.user;
    window.dispatchEvent(new Event('auth-changed'));
  } catch (e) {
    if (e.status === 401) authLogout();
  }
}

async function authLogin(email, password) {
  const data = await apiPost('/auth/login', { email, password });
  _token = data.token;
  _currentUser = data.user;
  localStorage.setItem('token', _token);
  window.dispatchEvent(new Event('auth-changed'));
}

async function authRegister(email, password, firstName, lastName) {
  const data = await apiPost('/auth/register', { email, password, firstName, lastName });
  _token = data.token;
  _currentUser = data.user;
  localStorage.setItem('token', _token);
  window.dispatchEvent(new Event('auth-changed'));
}

function authLogout() {
  _token = null;
  _currentUser = null;
  localStorage.removeItem('token');
  window.dispatchEvent(new Event('auth-changed'));
}

// Auto-fetch profile on load if token exists
if (_token) authFetchProfile();
