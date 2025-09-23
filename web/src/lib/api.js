// web/src/lib/api.js
const rawBase = import.meta.env.VITE_API_BASE || "/api";
const API_BASE = (rawBase.startsWith("http") ? rawBase : window.location.origin + rawBase).replace(/\/$/, "");

const LS_KEY = "access_token";

const getAccess = () => localStorage.getItem(LS_KEY) || "";
const setAccess = (t) => t ? localStorage.setItem(LS_KEY, t) : localStorage.removeItem(LS_KEY);

function withAuth(headers = {}) {
  const at = getAccess();
  return at ? { ...headers, Authorization: `Bearer ${at}` } : headers;
}

async function refresh() {
  const r = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Cache-Control": "no-store", "X-Requested-With": "fetch" },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error("REFRESH_FAIL");
  const { accessToken } = JSON.parse(txt || "{}");
  if (accessToken) setAccess(accessToken);
  return accessToken || "";
}

export async function ensureAccess() {
  if (getAccess()) return getAccess();
  try { return await refresh(); } catch { setAccess(""); return ""; }
}

async function requestJson(method, path, body, options = {}, retried = false) {
  const url = `${API_BASE}${path}`;
  const headers = withAuth({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Requested-With": "fetch",
    ...(options.headers || {}),
  });

  const r = await fetch(url, {
    method,
    headers,
    credentials: "include",
    body: body != null ? JSON.stringify(body) : undefined,
    ...options,
  });

  const txt = await r.text();

  if (!r.ok) {
    if (r.status === 401 && !retried) {
      try {
        await refresh();
        return requestJson(method, path, body, options, true);
      } catch {
        setAccess("");
      }
    }
    const e = new Error(`HTTP_${r.status}`);
    e.status = r.status;
    try { e.data = JSON.parse(txt); } catch { e.data = txt; }
    throw e;
  }

  return txt ? JSON.parse(txt) : null;
}

export const getJson  = (p, o) => requestJson("GET", p, null, o);
export const postJson = (p, b, o) => requestJson("POST", p, b, o);
export const delJson  = (p, o) => requestJson("DELETE", p, null, o);

/* Auth */
export async function login(email, password) {
  const data = await postJson("/auth/login", { email, password });
  if (data?.accessToken) setAccess(data.accessToken);
  // Vérifie la session et renvoie l’utilisateur
  return me();
}
export async function signup(email, password) {
  const data = await postJson("/auth/signup", { email, password });
  if (data?.accessToken) setAccess(data.accessToken);
  return me();
}
export async function logout() {
  try { await postJson("/auth/logout", {}); } catch {}
  setAccess("");
}

/* Session */
export async function me() {
  if (!getAccess()) await ensureAccess();
  return getJson("/auth/me");
}

export default { getJson, postJson, delJson, login, signup, logout, me, refresh, ensureAccess };
