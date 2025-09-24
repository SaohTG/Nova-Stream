// web/src/lib/mylist.js
import { useEffect, useState } from "react";
import { getJson, postJson } from "./api";

const KEY = "ns_mylist_v1";
const EVT = "ns_mylist_changed";
const API_BASE = import.meta.env.VITE_API_BASE_URL || "/api";

const k = (kind, id) => `${String(kind)}:${String(id)}`.toLowerCase();
const readMap = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
  catch { return {}; }
};
const writeMap = (m) => {
  localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new Event(EVT));
};

async function tryRemote(fn) {
  try { return await fn(); } catch { return null; }
}

// ---- public API
export async function fetchMyList() {
  const r = await tryRemote(() => getJson("/user/mylist"));
  if (Array.isArray(r)) return r;
  // fallback local
  return Object.values(readMap()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function syncLocalToRemote() {
  const map = readMap();
  const items = Object.entries(map).map(([key, v]) => ({
    kind: key.split(":")[0] === "series" ? "series" : "movie",
    id: key.split(":")[1],
    title: v.title || "",
    img: v.img || "",
    payload: v.raw || {},
    updatedAt: v.updatedAt || Date.now(),
  }));
  const r = await tryRemote(() => postJson("/user/mylist/merge", { items }));
  if (Array.isArray(r)) {
    // miroir local
    const m = {};
    for (const it of r) {
      m[k(it.kind, it.id)] = {
        kind: it.kind,
        id: String(it.id),
        title: it.title || "",
        img: it.img || "",
        raw: it.payload || null,
        updatedAt: it.updatedAt || Date.now(),
      };
    }
    writeMap(m);
    return r;
  }
  return items;
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
  } else {
    const entry = {
      kind,
      id: String(id),
      title: payload.title || "",
      img: payload.img || "",
      raw: payload.raw || null,
      updatedAt: Date.now(),
    };
    map[key] = entry;
    writeMap(map);
    await tryRemote(() =>
      postJson(`/user/mylist/${kind}/${encodeURIComponent(id)}`, {
        title: entry.title,
        img: entry.img,
        payload: entry.raw,
      })
    );
  }
}

export function hasInMyList(kind, id) {
  return Boolean(readMap()[k(kind, id)]);
}

// ---- hooks
export function useMyList() {
  const [list, setList] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const merged = await syncLocalToRemote();
      if (alive) setList(merged);
    };
    load();

    const h = () => fetchMyList().then((arr) => { if (alive) setList(arr); });
    window.addEventListener("storage", h);
    window.addEventListener(EVT, h);

    return () => {
      alive = false;
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
