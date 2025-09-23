// web/src/lib/mylist.js
import { useSyncExternalStore } from "react";

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
  const map = readMap();
  return Boolean(map[k(kind, id)]);
}
export function addToMyList(kind, id, payload = {}) {
  const map = readMap();
  map[k(kind, id)] = {
    kind,
    id: String(id),
    title: payload.title || "",
    img: payload.img || "",
    raw: payload.raw || null,
    updatedAt: Date.now(),
  };
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

function subscribe(cb) {
  const h = () => cb();
  window.addEventListener("storage", h);
  window.addEventListener(EVT, h);
  return () => {
    window.removeEventListener("storage", h);
    window.removeEventListener(EVT, h);
  };
}
function getSnapshotMap() { return readMap(); }

export function useMyListMap() {
  return useSyncExternalStore(subscribe, getSnapshotMap, getSnapshotMap);
}
export function useMyList() {
  const map = useMyListMap();
  return Object.values(map).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function useMyListStatus(kind, id) {
  const map = useMyListMap();
  const saved = Boolean(map[k(kind, id)]);
  return saved;
}
