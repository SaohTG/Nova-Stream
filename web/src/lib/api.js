// web/src/lib/api.js
const API = import.meta.env.VITE_API_URL || "http://85.31.239.110:4000";

function getAccess() { return localStorage.getItem("access_token") || ""; }
function setAccess(t) { if (t) localStorage.setItem("access_token", t); }

export async function refresh() {
  const r = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
  const txt = await r.text();
  if (!r.ok) {
    const err = new Error("REFRESH_FAIL"); err.status = r.status;
    try { err.data = JSON.parse(txt); } catch { err.data = txt; }
    throw err;
  }
  const { accessToken } = JSON.parse(txt || "{}");
  setAccess(accessToken);
  return accessToken;
}
export async function ensureAccess() {
  if (getAccess()) return getAccess();
  return await refresh();
}

function withAuth(headers = {}) {
  const at = getAccess();
  return at ? { ...headers, Authorization: `Bearer ${at}` } : headers;
}

async function requestJson(method, path, body, options = {}, _retried = false, _ensured = false) {
  if (!_ensured && !path.startsWith("/auth")) {
    try { await ensureAccess(); } catch {}
  }
  const headers = withAuth({ "Content-Type": "application/json", ...(options.headers || {}) });

  const r = await fetch(`${API}${path}`, {
    method, headers, credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined, ...options,
  });

  const txt = await r.text();
  if (!r.ok) {
    if (r.status === 401 && !_retried) {
      await refresh();
      return requestJson(method, path, body, options, true, true);
    }
    const err = new Error(`HTTP_${r.status}`); err.status = r.status;
    try { err.data = JSON.parse(txt); } catch { err.data = txt; }
    throw err;
  }
  return txt ? JSON.parse(txt) : null;
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
