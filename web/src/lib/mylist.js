// web/src/lib/mylist.js
const KEY = "ns_mylist_v1";
const EVT = "ns_mylist_changed";

function readMap() {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; }
  catch { return {}; }
}
function writeMap(m) {
  localStorage.setItem(KEY, JSON.stringify(m));
  window.dispatchEvent(new Event(EVT));
}
function k(kind, id) { return `${String(kind)}:${String(id)}`.toLowerCase(); }

export function hasInMyList(kind, id) {
  return Boolean(readMap()[k(kind, id)]);
}
export function addToMyList(kind, id, payload = {}) {
  const map = readMap();
  map[k(kind, id)] = { kind, id: String(id), title: payload.title || "", img: payload.img || "", raw: payload.raw || null, updatedAt: Date.now() };
  writeMap(map);
}
export function removeFromMyList(kind, id) {
  const map = readMap();
  delete map[k(kind, id)];
  writeMap(map);
}
export function toggleMyList(kind, id, payload = {}) {
  if (hasInMyList(kind, id)) removeFromMyList(kind, id);
  else addToMyList(kind, id, payload);
}

// ---- Hooks compatibles React 16/17/18 ----
import { useEffect, useState } from "react";

export function useMyList() {
  const [list, setList] = useState(() => Object.values(readMap()).sort((a,b)=>b.updatedAt-a.updatedAt));
  useEffect(() => {
    const h = () => setList(Object.values(readMap()).sort((a,b)=>b.updatedAt-a.updatedAt));
    window.addEventListener("storage", h);
    window.addEventListener(EVT, h);
    return () => { window.removeEventListener("storage", h); window.removeEventListener(EVT, h); };
  }, []);
  return list;
}

export function useMyListStatus(kind, id) {
  const [saved, setSaved] = useState(() => hasInMyList(kind, id));
  useEffect(() => {
    const h = () => setSaved(hasInMyList(kind, id));
    window.addEventListener("storage", h);
    window.addEventListener(EVT, h);
    return () => { window.removeEventListener("storage", h); window.removeEventListener(EVT, h); };
  }, [kind, id]);
  return saved;
}
