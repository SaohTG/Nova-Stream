// web/src/lib/api.js
const rawBase = import.meta.env.VITE_API_BASE || "/api";
const API_BASE = (rawBase.startsWith("http") ? rawBase : window.location.origin + rawBase).replace(/\/$/, "");

const LS_KEY = "access_token";

const getAccess = () => localStorage.getItem(LS_KEY) || "";
const setAccess = (t) => t ? localStorage.setItem(LS_KEY, t) : localStorage.removeItem(LS_KEY);

// Request cache and deduplication
const requestCache = new Map();
const pendingRequests = new Map();

// Cache configuration
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 100;

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

// Cache management
function getCacheKey(method, path, body) {
  return `${method}:${path}:${body ? JSON.stringify(body) : ''}`;
}

function getCachedResponse(cacheKey) {
  const cached = requestCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  if (cached) {
    requestCache.delete(cacheKey);
  }
  return null;
}

function setCachedResponse(cacheKey, data) {
  // Clean up old entries if cache is too large
  if (requestCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = requestCache.keys().next().value;
    requestCache.delete(oldestKey);
  }
  requestCache.set(cacheKey, { data, timestamp: Date.now() });
}

async function requestJson(method, path, body, options = {}, retried = false) {
  const url = `${API_BASE}${path}`;
  const cacheKey = getCacheKey(method, path, body);
  
  // Check cache for GET requests
  if (method === "GET" && !retried) {
    const cached = getCachedResponse(cacheKey);
    if (cached) {
      return cached;
    }
  }

  // Check for pending requests to avoid duplicates
  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey);
  }

  const headers = withAuth({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "X-Requested-With": "fetch",
    ...(options.headers || {}),
  });

  const requestPromise = (async () => {
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

    const result = txt ? JSON.parse(txt) : null;
    
    // Cache successful GET requests
    if (method === "GET" && result) {
      setCachedResponse(cacheKey, result);
    }
    
    return result;
  })();

  // Store pending request
  pendingRequests.set(cacheKey, requestPromise);
  
  try {
    const result = await requestPromise;
    return result;
  } finally {
    // Clean up pending request
    pendingRequests.delete(cacheKey);
  }
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
