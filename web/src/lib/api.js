// web/src/lib/api.js
const API_BASE = import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000";

async function request(path, { method = "GET", body, headers = {}, retry = true } = {}) {
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const init = {
    method,
    credentials: "include", // indispensable pour cookies
    headers: { "Content-Type": "application/json", ...headers },
  };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);

  let res, txt, data;
  try {
    res = await fetch(url, init);
  } catch (e) {
    const err = new Error(`Network error to ${path}: ${e.message}`);
    err.cause = e;
    throw err;
  }

  txt = await res.text().catch(() => "");
  try { data = txt ? JSON.parse(txt) : null; } catch { data = null; }

  if (!res.ok) {
    // Auto refresh 401 une fois
    if (res.status === 401 && retry) {
      try {
        const r = await fetch(`${API_BASE}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        if (r.ok) return request(path, { method, body, headers, retry: false });
      } catch {}
    }
    const msg = data?.error || data?.message || `HTTP ${res.status} on ${path}${txt ? ` – ${txt.slice(0, 200)}` : ""}`;
    const err = new Error(msg);
    err.status = res.status;
    err.path = path;
    err.body = txt;
    throw err;
  }

  return data ?? null;
}

export const getJson = (path, opts) => request(path, { ...opts, method: "GET" });
export const postJson = (path, body, opts) => request(path, { ...opts, method: "POST", body });
export const delJson  = (path, opts) => request(path, { ...opts, method: "DELETE" });
export { API_BASE };
