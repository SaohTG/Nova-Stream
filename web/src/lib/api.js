// web/src/lib/api.js

// Base API depuis l'env Vite; fallback local
const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE) ||
  "http://localhost:4000";

// Petit utilitaire interne pour parser JSON en gérant 204/empty
async function parseJsonSafe(res) {
  if (res.status === 204) return null;
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

// Tente un refresh de session et renvoie true/false
async function tryRefresh() {
  try {
    const r = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * Requête générique avec:
 * - credentials: 'include' (cookies httpOnly)
 * - retry automatique 1x sur 401 via /auth/refresh
 */
async function request(path, { method = "GET", body, headers } = {}) {
  const first = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(headers || {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (first.status === 401) {
    const ok = await tryRefresh();
    if (ok) {
      const second = await fetch(`${API_BASE}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(headers || {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!second.ok) {
        const data = await parseJsonSafe(second);
        const msg = data?.error || `HTTP ${second.status}`;
        throw new Error(msg);
      }
      return parseJsonSafe(second);
    }
  }

  if (!first.ok) {
    const data = await parseJsonSafe(first);
    const msg = data?.error || `HTTP ${first.status}`;
    throw new Error(msg);
  }
  return parseJsonSafe(first);
}

/* -------------------- Helpers haut-niveau -------------------- */

export function getJson(path) {
  return request(path, { method: "GET" });
}

export function postJson(path, body) {
  return request(path, { method: "POST", body });
}

export function putJson(path, body) {
  return request(path, { method: "PUT", body });
}

export function delJson(path, body) {
  return request(path, { method: "DELETE", body });
}

/* -------------------- Expose la base -------------------- */
export { API_BASE };
