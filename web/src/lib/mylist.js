// web/src/lib/mylist.js
import { useEffect, useState } from "react";
import { getJson, postJson } from "./api";

const KEY = "ns_mylist_v1";
const EVT = "ns_mylist_changed";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";
const ETAG_KEY = "ns_mylist_etag";

const k = (kind, id) => `${String(kind)}:${String(id)}`.toLowerCase();
const readMap = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
const writeMap = (m) => { localStorage.setItem(KEY, JSON.stringify(m)); window.dispatchEvent(new Event(EVT)); };

async function tryRemote(fn) { try { return await fn(); } catch { return null; } }

// GET + ETag → 304 si inchangé
async function fetchServerListWithETag(force = false) {
  const etag = localStorage.getItem(ETAG_KEY) || "";
  const headers = (!force && etag) ? { "If-None-Match": etag } : {};
  const r = await fetch(`${API_BASE}/user/mylist`, { method: "GET", credentials: "include", headers });
  if (r.status === 304) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const list = await r.json();
  const newEtag = r.headers.get("ETag");
  if (newEtag) localStorage.setItem(ETAG_KEY, newEtag);
  return Array.isArray(list) ? list : null;
}

// --- API publique
export async function fetchMyList() {
  const r = await tryRemote(() => getJson("/user/mylist"));
  if (Array.isArray(r)) return r;
  return Object.values(readMap()).sort((a,b)=>b.updatedAt-a.updatedAt);
}

// IMPORTANT: plus de “merge” automatique au mount.
// On TRUST le serveur et on écrase le local.
export async function syncFromServer() {
  const server = await tryRemote(() => fetchServerListWithETag(true)); // force 200 la première fois
  if (Array.isArray(server)) {
    const m = {};
    for (const it of server) {
      m[k(it.kind, it.id)] = {
        kind: it.kind, id: String(it.id),
        title: it.title || "", img: it.img || "",
        raw: it.payload || null, updatedAt: it.updatedAt || Date.now(),
      };
    }
    writeMap(m);
    return server;
  }
  // fallback offline: garder local tel quel
  return Object.values(readMap()).sort((a,b)=>b.updatedAt-a.updatedAt);
}

export async function toggleMyList(kind, id, payload = {}) {
  const key = k(kind, id);
  const map = readMap();
  const exists = Boolean(map[key]);

  if (exists) {
    if (map[key]) delete map[key];
    writeMap(map);
    await tryRemote(() =>
      fetch(`${API_BASE}/user/mylist/${kind}/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
    );
    // pull pour éviter les ré-add par un autre device
    const refreshed = await tryRemote(() => fetchServerListWithETag(true));
    if (Array.isArray(refreshed)) {
      const m = {};
      for (const it of refreshed) {
        m[k(it.kind, it.id)] = {
          kind: it.kind, id: String(it.id),
          title: it.title || "", img: it.img || "",
          raw: it.payload || null, updatedAt: it.updatedAt || Date.now(),
        };
      }
      writeMap(m);
    }
  } else {
    const entry = {
      kind, id: String(id),
      title: payload.title || "", img: payload.img || "",
      raw: payload.raw || null, updatedAt: Date.now(),
    };
    map[key] = entry;
    writeMap(map);
    await tryRemote(() =>
      postJson(`/user/mylist/${kind}/${encodeURIComponent(id)}`, {
        title: entry.title, img: entry.img, payload: entry.raw
      })
    );
    // pull pour synchroniser l’etag et l’ordre serveur
    const refreshed = await tryRemote(() => fetchServerListWithETag(true));
    if (Array.isArray(refreshed)) {
      const m = {};
      for (const it of refreshed) {
        m[k(it.kind, it.id)] = {
          kind: it.kind, id: String(it.id),
          title: it.title || "", img: it.img || "",
          raw: it.payload || null, updatedAt: it.updatedAt || Date.now(),
        };
      }
      writeMap(m);
    }
  }
}

export function hasInMyList(kind, id) {
  return Boolean(readMap()[k(kind, id)]);
}

// --- hooks
export function useMyList() {
  const [list, setList] = useState([]);

  useEffect(() => {
    let alive = true;

    const initial = async () => {
      const data = await syncFromServer();
      if (alive) setList(data);
    };
    initial();

    // revalider régulièrement + à chaque focus
    const update = async () => {
      const next = await fetchServerListWithETag(); // 304 = null
      if (alive && next) {
        const m = {};
        for (const it of next) {
          m[k(it.kind, it.id)] = {
            kind: it.kind, id: String(it.id),
            title: it.title || "", img: it.img || "",
            raw: it.payload || null, updatedAt: it.updatedAt || Date.now(),
          };
        }
        writeMap(m);
        setList(next);
      }
    };

    const onFocus = () => { update(); };
    const onVis = () => { if (document.visibilityState === "visible") update(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    const id = setInterval(update, 15000);

    // événements locaux
    const h = () => fetchMyList().then((arr) => { if (alive) setList(arr); });
    window.addEventListener("storage", h);
    window.addEventListener(EVT, h);

    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("storage", h);
      window.removeEventListener(EVT, h);
    };
  }, []);

  return list;
}

export function useMyListStatus(kind, id) {
  const [saved, setSaved] = useState(() => hasInMyList(kind, id));
  useEffect(() => {
    const h = () => setSaved(hasInMyList(kind, id));
    window.addEventListener("storage", h);
    window.addEventListener(EVT, h);
    return () => {
      window.removeEventListener("storage", h);
      window.removeEventListener(EVT, h);
    };
  }, [kind, id]);
  return saved;
}
