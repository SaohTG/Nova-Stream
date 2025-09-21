// api/src/modules/xtream.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import { ensureAuth } from "./auth.js";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ================= AES-256-GCM ================= */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
}
function enc(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
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

/* ================= Utils ================= */
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
  if (m.startsWith("//")) {
    try { return new URL(base).protocol + m; } catch { return "http:" + m; }
  }
  if (m.startsWith("/")) return `${base}${m}`;
  return `${base}/${m}`;
}
function buildPlayerApi(baseUrl, username, password, action, extra = {}) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  if (action) u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
async function fetchWithTimeout(url, ms = 10000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers }); }
  finally { clearTimeout(t); }
}
async function fetchJson(url) {
  const r = await fetchWithTimeout(url, 10000, { "User-Agent": "Mozilla/5.0 (NovaStream/1.0)" });
  const txt = await r.text();
  if (!r.ok) { const err = new Error(`XTREAM_HTTP_${r.status}`); err.status = r.status; err.body = txt; throw err; }
  try { return JSON.parse(txt); }
  catch { const err = new Error("XTREAM_BAD_JSON"); err.body = txt; throw err; }
}

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xtream_accounts (
      user_id uuid PRIMARY KEY,
      base_url text NOT NULL,
      username_enc text NOT NULL,
      password_enc text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_xtream (
      user_id uuid PRIMARY KEY,
      base_url text NOT NULL,
      username_enc text NOT NULL,
      password_enc text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
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
const pickCatId = (req) =>
  (req.query.category_id ?? req.query.categoryId ?? req.body?.category_id ?? req.body?.categoryId ?? "0");

/* -------- Image helpers -------- */
function proxyUrl(rawUrl) {
  if (!rawUrl) return "";
  return `/xtream/image?url=${encodeURIComponent(rawUrl)}`;
}
function resolveIcon(raw, creds) {
  if (!raw) return "";
  const absolute = absUrl(creds.baseUrl, raw);
  return proxyUrl(absolute);
}
function mapListWithIcons(list = [], creds) {
  return (list || []).map(it => {
    const raw = it.stream_icon || it.icon || it.logo || it.poster || it.image || it.cover || it.cover_big;
    const resolved = resolveIcon(raw, creds);
    return {
      ...it,
      stream_icon: resolved || it.stream_icon || "",
      icon:        resolved || it.icon || "",
      logo:        resolved || it.logo || "",
      poster:      resolved || it.poster || "",
      image:       resolved || it.image || "",
      cover:       resolved || it.cover || "",
      cover_big:   resolved || it.cover_big || "",
    };
  });
}

/* ================= Handlers ================= */
async function hLink(req, res, next) {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl || req.body?.serverUrl);
    const username = (req.body?.username || "").toString().trim();
    const password = (req.body?.password || "").toString().trim();
    if (!baseUrl || !username || !password) return res.status(422).json({ message: "Missing fields" });

    const test = await fetchJson(buildPlayerApi(baseUrl, username, password));
    const ok = test?.user_info?.auth === 1 || test?.user_info?.status === "Active";
    if (!ok) return res.status(400).json({ message: "Xtream test failed" });

    await ensureTables();
    await pool.query(
      `INSERT INTO xtream_accounts (user_id, base_url, username_enc, password_enc)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE
         SET base_url=EXCLUDED.base_url,
             username_enc=EXCLUDED.username_enc,
             password_enc=EXCLUDED.password_enc,
             updated_at=now()`,
      [req.user.sub, baseUrl, enc(username), enc(password)]
    );
    res.json({ ok: true });
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hStatus(req, res, next) {
  try { const c = await getCreds(req.user?.sub); res.json({ linked: !!c, baseUrl: c?.baseUrl || null }); }
  catch (e) { e.status = e.status || 500; next(e); }
}
async function hUnlink(req, res, next) {
  try {
    await ensureTables();
    await pool.query(`DELETE FROM xtream_accounts WHERE user_id=$1`, [req.user?.sub]);
    await pool.query(`DELETE FROM user_xtream WHERE user_id=$1`, [req.user?.sub]);
    res.status(204).end();
  } catch (e) { e.status = e.status || 500; next(e); }
}

/* Catalogues */
async function hMovieCategories(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_categories"));
    res.json(data || []);
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hMovies(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const category_id = pickCatId(req);
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams", { category_id }));
    res.json(mapListWithIcons(data, c));
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hVodInfo(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_info", { vod_id: req.params.vod_id }));
    const coverRaw = info?.movie_data?.cover_big || info?.movie_data?.movie_image;
    const cover = resolveIcon(coverRaw, c);
    res.json({ ...info, movie_data: { ...info?.movie_data, cover_big: cover, movie_image: cover } });
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hSeriesCategories(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_categories"));
    res.json(data || []);
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hSeries(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const category_id = pickCatId(req);
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series", { category_id }));
    res.json(mapListWithIcons(data, c));
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hSeriesInfo(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_info", { series_id: req.params.series_id }));
    const posterRaw = info?.info?.cover || info?.info?.backdrop_path;
    const poster = resolveIcon(posterRaw, c);
    res.json({ ...info, info: { ...info?.info, cover: poster, backdrop_path: poster } });
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hLiveCategories(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_categories"));
    res.json(data || []);
  } catch (e) { e.status = e.status || 500; next(e); }
}
async function hLive(req, res, next) {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const category_id = pickCatId(req);
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_streams", { category_id }));
    res.json(mapListWithIcons(data, c));
  } catch (e) { e.status = e.status || 500; next(e); }
}

/* ================= Routes ================= */
router.post("/link",   ensureAuth, hLink);
router.get("/status",  ensureAuth, hStatus);
router.delete("/unlink", ensureAuth, hUnlink);

router.get ("/movie-categories",  ensureAuth, hMovieCategories);
router.get ("/movies",            ensureAuth, hMovies);
router.post("/movies",            ensureAuth, hMovies); // <-- handler réutilisé
router.get ("/vod-info/:vod_id",  ensureAuth, hVodInfo);

router.get ("/series-categories", ensureAuth, hSeriesCategories);
router.get ("/series",            ensureAuth, hSeries);
router.post("/series",            ensureAuth, hSeries); // <-- handler réutilisé
router.get ("/series-info/:series_id", ensureAuth, hSeriesInfo);

router.get ("/live-categories",   ensureAuth, hLiveCategories);
router.get ("/live",              ensureAuth, hLive);
router.post("/live",              ensureAuth, hLive); // <-- handler réutilisé

/* ================= Image proxy ================= */
router.get("/image", ensureAuth, async (req, res, next) => {
  try {
    const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
    const url = req.query.url;
    if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ message: "url required" });

    const r = await fetchWithTimeout(String(url), 10000, {
      "User-Agent": "Mozilla/5.0 (NovaStream/1.0)",
      "Referer": c.baseUrl,
      "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    });
    if (!r.ok) return res.status(r.status).end();

    const ct = r.headers.get("content-type") || "image/jpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await r.arrayBuffer());
    res.end(buf);
  } catch (e) { e.status = e.status || 500; next(e); }
});

export default router;
