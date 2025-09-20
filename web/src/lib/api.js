// web/src/lib/api.js
const API = import.meta.env.VITE_API_URL || "http://85.31.239.110:4000";

function getAccess() {
  return localStorage.getItem("access_token") || "";
}
function setAccess(t) {
  if (t) localStorage.setItem("access_token", t);
}

export async function refresh() {
  const res = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
  if (!res.ok) throw new Error("REFRESH_FAIL");
  const { accessToken } = await res.json();
  setAccess(accessToken);
  return accessToken;
}

/** S'assure qu'on a un access token (via localStorage ou refresh cookie) */
export async function ensureAccess() {
  if (getAccess()) return getAccess();
  return await refresh();
}

function withAuth(headers = {}) {
  const at = getAccess();
  return at ? { ...headers, Authorization: `Bearer ${at}` } : headers;
}

async function requestJson(method, path, body, options = {}, _retried = false, _ensured = false) {
  // Si endpoint protégé (pas /auth/*), on s’assure d’avoir un token avant l’appel
  if (!_ensured && !path.startsWith("/auth")) {
    try { await ensureAccess(); } catch { /* ignore: tombera 401 et on remontera une erreur propre */ }
  }

  const headers = withAuth({ "Content-Type": "application/json", ...(options.headers || {}) });

  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined,
    ...options,
  });

  if (res.status === 401 && !_retried) {
    // token manquant/expiré → tente un refresh puis rejoue UNE fois
    await refresh();
    const headers2 = withAuth({ "Content-Type": "application/json", ...(options.headers || {}) });
    const res2 = await fetch(`${API}${path}`, {
      method,
      headers: headers2,
      credentials: "include",
      body: body != null ? JSON.stringify(body) : undefined,
      ...options,
    });
    if (!res2.ok) throw new Error(`HTTP_${res2.status}`);
    return res2.status === 204 ? null : res2.json();
  }

  if (!res.ok) throw new Error(`HTTP_${res.status}`);
  return res.status === 204 ? null : res.json();
}

export function getJson(path, options = {}) { return requestJson("GET", path, null, options); }
export function postJson(path, body, options = {}) { return requestJson("POST", path, body, options); }
export function delJson(path, options = {}) { return requestJson("DELETE", path, null, options); }

export async function login(email, password) {
  const { accessToken } = await postJson("/auth/login", { email, password }, {}, false, true);
  setAccess(accessToken);
  return accessToken;
}
export async function signup(email, password) {
  const { accessToken } = await postJson("/auth/signup", { email, password }, {}, false, true);
  setAccess(accessToken);
  return accessToken;
}
export function me() { return getJson("/auth/me"); }

export default { getJson, postJson, delJson, login, signup, me, refresh, ensureAccess };
