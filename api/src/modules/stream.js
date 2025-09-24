// api/src/modules/stream.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ===== crypto (compatible xtream/media) ===== */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}
function dec(blob) {
  const [v, ivb64, tagb64, ctb64] = String(blob).split(":");
  if (v !== "v1") throw new Error("Bad enc version");
  const key = getKey();
  const iv = Buffer.from(ivb64, "base64");
  const tag = Buffer.from(tagb64, "base64");
  const ct = Buffer.from(ctb64, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

/* ===== creds ===== */
function normalizeBaseUrl(u) {
  let s = String(u || "").trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s
    .replace(/\/player_api\.php.*$/i, "")
    .replace(/\/portal\.php.*$/i, "")
    .replace(/\/stalker_portal.*$/i, "")
    .replace(/\/(?:series|movie|live)\/.*$/i, "");
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
async function getCreds(userId) {
  const q = `
    SELECT base_url, username_enc, password_enc FROM xtream_accounts WHERE user_id=$1
    UNION ALL
    SELECT base_url, username_enc, password_enc FROM user_xtream   WHERE user_id=$1
    LIMIT 1
  `;
  const { rows } = await pool.query(q, [userId]);
  const r = rows[0];
  if (!r) return null;
  return {
    baseUrl: normalizeBaseUrl(r.base_url),
    username: dec(r.username_enc),
    password: dec(r.password_enc),
  };
}

/* ===== HTTP helpers ===== */
async function fetchWithTimeout(url, ms = 8000, headers = {}, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers, ...init });
  } finally { clearTimeout(t); }
}
async function reachable(u, headers = {}) {
  try {
    let r = await fetchWithTimeout(u, 6000, { "User-Agent": "VLC/3.0", ...headers }, { method: "HEAD" });
    if (r.ok) return true;
    r = await fetchWithTimeout(u, 6000, { "User-Agent": "VLC/3.0", Range: "bytes=0-0", ...headers }, { method: "GET" });
    return r.ok;
  } catch { return false; }
}

/* ===== /vodmp4/:id -> HLS si dispo, sinon fichier proxifié ===== */
router.get("/vodmp4/:id", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const id = String(req.params.id);

    const creds = await getCreds(uid);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const base = creds.baseUrl;
    const user = encodeURIComponent(creds.username);
    const pass = encodeURIComponent(creds.password);

    // 1) HLS en priorité (meilleure compat via media.hls réécrit)
    const m3u8 = `${base}/movie/${user}/${pass}/${id}.m3u8`;
    if (await reachable(m3u8, { Referer: base + "/" })) {
      return res.redirect(302, `/api/media/movie/${encodeURIComponent(id)}/hls.m3u8`);
    }

    // 2) fichiers progressifs
    const files = [".mp4", ".ts", ".mkv"].map(ext => `${base}/movie/${user}/${pass}/${id}${ext}`);
    for (const u of files) {
      if (await reachable(u, { Referer: base + "/" })) {
        return res.redirect(302, `/api/media/proxy?url=${encodeURIComponent(u)}`);
      }
    }

    return res.status(404).json({ error: "no-source" });
  } catch (e) { next(e); }
});

/* ===== pass-thru vers media pour HLS live/séries (chemins stables côté front) ===== */
router.get("/hls/live/:id.m3u8", (req, res) => {
  return res.redirect(302, `/api/media/live/${encodeURIComponent(String(req.params.id))}/hls.m3u8`);
});
router.get("/hls/series/:id.m3u8", (req, res) => {
  return res.redirect(302, `/api/media/series/${encodeURIComponent(String(req.params.id))}/hls.m3u8`);
});
router.get("/hls/movie/:id.m3u8", (req, res) => {
  return res.redirect(302, `/api/media/movie/${encodeURIComponent(String(req.params.id))}/hls.m3u8`);
});

export default router;
