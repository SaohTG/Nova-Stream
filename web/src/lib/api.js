// web/src/lib/api.js
const API = import.meta.env.VITE_API_URL || 'http://85.31.239.110:4000';

function authHeaders() {
  const access = localStorage.getItem('access_token');
  return access ? { Authorization: `Bearer ${access}` } : {};
}

async function refresh() {
  const res = await fetch(`${API}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error('REFRESH_FAIL');
  const { accessToken } = await res.json();
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}

async function requestJson(method, path, body, options = {}, _retried = false) {
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders(),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body != null ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (res.status === 401 && !_retried) {
    // tente un refresh puis rejoue la requête une fois
    try {
      await refresh();
      const headers2 = {
        ...headers,
        ...authHeaders(), // nouveau token
      };
      const res2 = await fetch(`${API}${path}`, {
        method,
        headers: headers2,
        credentials: 'include',
        body: body != null ? JSON.stringify(body) : undefined,
        ...options,
      });
      if (!res2.ok) throw new Error(`HTTP_${res2.status}`);
      return res2.status === 204 ? null : res2.json();
    } catch {
      throw new Error('UNAUTH');
    }
  }

  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.status === 204 ? null : res.json();
}

export async function getJson(path, options = {}) {
  return requestJson('GET', path, null, options);
}

export async function postJson(path, body, options = {}) {
  return requestJson('POST', path, body, options);
}

export async function delJson(path, options = {}) {
  return requestJson('DELETE', path, null, options);
}

/* Helpers auth de haut niveau (conservent l’accès pour ton app) */
export async function login(email, password) {
  const { accessToken } = await postJson('/auth/login', { email, password });
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}

export async function signup(email, password) {
  const { accessToken } = await postJson('/auth/signup', { email, password });
  localStorage.setItem('access_token', accessToken);
  return accessToken;
}

export async function me() {
  return getJson('/auth/me');
}

// Export si tu veux l’appeler directement
export { refresh };
