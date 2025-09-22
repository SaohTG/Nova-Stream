// api/src/modules/tmdb.js
import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ===== helpers ===== */
async function fetchWithTimeout(url, ms = 12000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers }); }
  finally { clearTimeout(t); }
}
async function fetchJson(url) {
  const r = await fetchWithTimeout(url, 12000, { "User-Agent": "NovaStream/1.0" });
  const txt = await r.text();
  if (!r.ok) { const err = new Error(`HTTP_${r.status}`); err.status = r.status; err.body = txt; throw err; }
  try { return JSON.parse(txt); } catch { const err = new Error("BAD_JSON"); err.body = txt; throw err; }
}
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function absUrl(base, maybe) {
  const m = (maybe || "").toString().trim();
  if (!m) return "";
  if (/^https?:\/\//i.test(m)) return m;
  if (m.startsWith("/")) return `${base}${m}`;
  return `${base}/${m}`;
}
function proxyXtreamImage(rawUrl) {
  if (!rawUrl) return "";
  return `/api/xtream/image?url=${encodeURIComponent(rawUrl)}`;
}
function mapIcon(it, baseUrl) {
  const raw = it.stream_icon || it.icon || it.logo || it.poster || it.image || it.cover || it.cover_big;
  const abs = absUrl(baseUrl, raw);
  const prox = proxyXtreamImage(abs);
  return {
    ...it,
    stream_icon: prox || it.stream_icon || "",
    icon: prox || it.icon || "",
    logo: prox || it.logo || "",
    poster: prox || it.poster || "",
    image: prox || it.image || "",
    cover: prox || it.cover || "",
    cover_big: prox || it.cover_big || "",
  };
}
async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS xtream_accounts (
    user_id uuid PRIMARY KEY, base_url text NOT NULL,
    username_enc text NOT NULL, password_enc text NOT NULL,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_xtream (
    user_id uuid PRIMARY KEY, base_url text NOT NULL,
    username_enc text NOT NULL, password_enc text NOT NULL,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );`);
}
import crypto from "crypto";
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}
function dec(blob) {
  const [v, ivb64, tagb64, ctb64] = String(blob).split(":");
  if (v !== "v1") throw new Error("Unsupported enc version");
  const key = getKey();
  const iv = Buffer.from(ivb64, "base64");
  const tag = Buffer.from(tagb64, "base64");
  const ct = Buffer.from(ctb64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
async function getCreds(userId) {
  await ensureTables();
  let row = (await pool.query(
    `SELECT base_url, username_enc, password_enc FROM xtream_accounts WHERE user_id=$1 LIMIT 1`, [userId]
  )).rows[0];
  if (!row) {
    row = (await pool.query(
      `SELECT base_url, username_enc, password_enc FROM user_xtream WHERE user_id=$1 LIMIT 1`, [userId]
    )).rows[0];
  }
  if (!row) return null;
  return {
    baseUrl: normalizeBaseUrl(row.base_url),
    username: dec(row.username_enc),
    password: dec(row.password_enc),
  };
}
function buildPlayerApi(baseUrl, username, password, action, extra = {}) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  if (action) u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
const norm = (s) => (s || "").toString()
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/* ===== GET /tmdb/trending-week-mapped =====
   - Prend 3 pages TMDB (≈60 titres)
   - Matche avec VOD + Series Xtream par nom normalisé
   - Retourne les 15 premiers trouvés, avec images proxifiées Xtream et __rank 1..15
*/
router.get("/trending-week-mapped", async (req, res, next) => {
  try {
    const key = process.env.TMDB_API_KEY;
    if (!key) return res.json([]);

    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.json([]);

    // charge catalogues Xtream une fois
    const [vodAll, serAll] = await Promise.all([
      fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_streams")).catch(() => []),
      fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series")).catch(() => []),
    ]);
    const xtream = [...(vodAll || []), ...(serAll || [])].map((it) => ({ ...it, _n: norm(it.name || it.title || it.stream_display_name) }));

    // étend le pool TMDB (pages 1..3)
    const tmdbPages = await Promise.all([1, 2, 3].map((p) =>
      fetchJson(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}&page=${p}&language=fr-FR`).catch(() => ({ results: [] }))
    ));
    const tmdb = tmdbPages.flatMap(p => Array.isArray(p.results) ? p.results : []).filter(Boolean);

    const out = [];
    const used = new Set();
    for (const item of tmdb) {
      const t = norm(item.title || item.name);
      if (!t) continue;
      const hit = xtream.find((x) => x._n && (x._n.includes(t) || t.includes(x._n)));
      if (!hit) continue;
      const id = hit.stream_id || hit.series_id || hit.name;
      if (used.has(id)) continue;
      used.add(id);
      out.push(hit);
      if (out.length === 15) break;
    }

    const mapped = out.map((it, i) => ({ ...mapIcon(it, creds.baseUrl), __rank: i + 1 }));
    res.json(mapped);
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

export default router;
