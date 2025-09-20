const API = import.meta.env.VITE_API_URL || 'http://85.31.239.110:4000';

export async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('LOGIN_FAIL');
  const { accessToken } = await res.json();
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}

export async function signup(email, password) {
  const res = await fetch(`${API}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error('SIGNUP_FAIL');
  const { accessToken } = await res.json();
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}

export async function me() {
  const access = localStorage.getItem('access_token') || '';
  const res = await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${access}` },
    credentials: 'include',
  });
  if (res.status === 401) throw new Error('UNAUTH');
  return res.json();
}

export async function refresh() {
  const res = await fetch(`${API}/auth/refresh`, { method: 'POST', credentials: 'include' });
  if (!res.ok) throw new Error('REFRESH_FAIL');
  const { accessToken } = await res.json();
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}
