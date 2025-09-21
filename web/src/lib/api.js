// web/src/lib/api.js
const API = import.meta.env.VITE_API_URL || "https://85.31.239.110:4000";

function getAccess() { return localStorage.getItem("access_token") || ""; }
function setAccess(t) { if (t) localStorage.setItem("access_token", t); }
function withAuth(h = {}) {
  const at = getAccess();
  return at ? { ...h, Authorization: `Bearer ${at}` } : h;
}

export async function refresh() {
  const r = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "include" });
  const txt = await r.text();
  if (!r.ok) throw new Error("REFRESH_FAIL");
  const { accessToken } = JSON.parse(txt || "{}");
  setAccess(accessToken);
  return accessToken;
}

export async function ensureAccess() {
  if (getAccess()) return getAccess();
  try { return await refresh(); } catch { return ""; }
}

async function requestJson(method, path, body, options = {}, retried = false) {
  const headers = withAuth({ "Content-Type": "application/json", ...(options.headers || {}) });
  const r = await fetch(`${API}${path}`, {
    method, headers, credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined, ...options,
  });
  const txt = await r.text();

  // Si /auth/me renvoie 401, l’API retentera déjà côté serveur via cookie rt.
  if (!r.ok) {
    if (r.status === 401 && !retried) {
      await refresh();
      return requestJson(method, path, body, options, true);
    }
    const e = new Error(`HTTP_${r.status}`); e.status = r.status;
    try { e.data = JSON.parse(txt); } catch { e.data = txt; }
    throw e;
  }
  return txt ? JSON.parse(txt) : null;
}

export const getJson  = (p, o) => requestJson("GET", p, null, o);
export const postJson = (p, b, o) => requestJson("POST", p, b, o);
export const delJson  = (p, o) => requestJson("DELETE", p, null, o);

/* Auth helpers */
export async function login(email, password) {
  const { accessToken } = await postJson("/auth/login", { email, password });
  setAccess(accessToken);
  return accessToken;
}
export async function signup(email, password) {
  const { accessToken } = await postJson("/auth/signup", { email, password });
  setAccess(accessToken);
  return accessToken;
}

/* Session helpers */
export async function me() {
  // petit filet: pré-ensure si pas d’AT local (premier boot)
  if (!getAccess()) await ensureAccess();
  return getJson("/auth/me");
}

export default { getJson, postJson, delJson, login, signup, me, refresh, ensureAccess };
