// api/src/modules/xtream.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ============== Cache mémoire simple ============== */
const MEMO = new Map();           // key -> { t, v }
const TTL_MS = 5 * 60 * 1000;     // 5 min
const MAX_KEYS = 50;
const mkey = (uid, base, kind) => `${uid}|${base}|${kind}`;
const mget = (k) => {
  const entry = MEMO.get(k);
  if (!entry) return null;
  if (Date.now() - entry.t > TTL_MS) { MEMO.delete(k); return null; }
  return entry.v;
};
const mset = (k, v) => {
  if (MEMO.size >= MAX_KEYS) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(k, { t: Date.now(), v });
};

/* ============== AES-256-GCM ============== */
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

/* ============== Utils ============== */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

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
  const r = await fetchWithTimeout(url, 12000, { "User-Agent": "Mozilla/5.0 (NovaStream/1.0)" });
  const txt = await r.text();
  if (!r.ok) { const err = new Error(`XTREAM_HTTP_${r.status}`); err.status = r.status; err.body = txt; throw err; }
  try { return JSON.parse(txt); } catch { const err = new Error("XTREAM_BAD_JSON"); err.body = txt; throw err; }
}
async function fetchJsonBudget(url, _budgetMs = 1200) {
  try { return await fetchJson(url); }
  catch (e) { if (e.name === "AbortError") return []; throw e; }
}

/* ============== DB helpers ============== */
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

/* ============== Images helpers ============== */
function proxyUrl(rawUrl) {
  if (!rawUrl) return "";
  return `/api/xtream/image?url=${encodeURIComponent(rawUrl)}`;
}
function resolveIcon(raw, creds) {
  if (!raw) return "";
  const absolute = absUrl(creds.baseUrl, raw);
  return proxyUrl(absolute);
}
function mapListWithIcons(list = [], creds) {
  return (list || []).map((it) => {
    const raw = it.stream_icon || it.icon || it.logo || it.poster || it.image || it.cover || it.cover_big;
    const resolved = resolveIcon(raw, creds);
    return {
      ...it,
      stream_icon: resolved || it.stream_icon || "",
      icon: resolved || it.icon || "",
      logo: resolved || it.logo || "",
      poster: resolved || it.poster || "",
      image: resolved || it.image || "",
      cover: resolved || it.cover || "",
      cover_big: resolved || it.cover_big || "",
    };
  });
}
const pickCatId = (req) =>
  (req.query.category_id ?? req.query.categoryId ?? req.body?.category_id ?? req.body?.categoryId ?? "0");
const pickLimit = (req, fallback = 50, max = 200) => {
  const n = Number(req.query.limit ?? req.body?.limit ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), max);
};

/* ============== Link / Status ============== */
router.post("/link", ah(async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });

  const baseUrl = normalizeBaseUrl(req.body?.baseUrl || req.body?.serverUrl);
  const username = (req.body?.username || "").toString().trim();
  const password = (req.body?.password || "").toString().trim();
  if (!baseUrl || !username || !password) return res.status(422).json({ message: "Missing fields" });

  try {
    const test = await fetchJson(buildPlayerApi(baseUrl, username, password));
    const ok = test?.user_info?.auth === 1 || test?.user_info?.status === "Active";
    if (!ok) return res.status(400).json({ message: "Xtream test failed" });
  } catch (e) {
    return res.status(e.status === 401 ? 400 : 503).json({ message: e.message || "Xtream unreachable" });
  }

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
}));

router.get("/status", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub);
  res.json({ linked: !!c, baseUrl: c?.baseUrl || null });
}));

router.delete("/unlink", ah(async (req, res) => {
  await ensureTables();
  await pool.query(`DELETE FROM xtream_accounts WHERE user_id=$1`, [req.user?.sub]);
  await pool.query(`DELETE FROM user_xtream WHERE user_id=$1`, [req.user?.sub]);
  res.status(204).end();
}));

/* ============== Catalogues ============== */
// Movies
const handleMovieCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_categories"));
    res.json(data || []);
  } catch (error) {
    console.error("[XTREAM ERROR] Movie categories fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/movie-categories", handleMovieCategories);

const handleMovies = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams", { category_id }));
    res.json(mapListWithIcons((data || []).slice(0, limit), c));
  } catch (error) {
    console.error("[XTREAM ERROR] Movies fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/movies", handleMovies);
router.post("/movies", handleMovies);

router.get("/vod-info/:vod_id", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_info", { vod_id: req.params.vod_id }));
  const coverRaw = info?.movie_data?.cover_big || info?.movie_data?.movie_image;
  const cover = resolveIcon(coverRaw, c);
  res.json({ ...info, movie_data: { ...info?.movie_data, cover_big: cover, movie_image: cover } });
}));

// Series
const handleSeriesCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_categories"));
    res.json(data || []);
  } catch (error) {
    console.error("[XTREAM ERROR] Series categories fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/series-categories", handleSeriesCategories);

const handleSeries = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series", { category_id }));
    res.json(mapListWithIcons((data || []).slice(0, limit), c));
  } catch (error) {
    console.error("[XTREAM ERROR] Series fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/series", handleSeries);
router.post("/series", handleSeries);

router.get("/series-info/:series_id", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_info", { series_id: req.params.series_id }));
  const posterRaw = info?.info?.cover || info?.info?.backdrop_path;
  const poster = resolveIcon(posterRaw, c);
  res.json({ ...info, info: { ...info?.info, cover: poster, backdrop_path: poster } });
}));

// Live
const handleLiveCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_categories"));
    res.json(data || []);
  } catch (error) {
    console.error("[XTREAM ERROR] Live categories fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/live-categories", handleLiveCategories);

const handleLive = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_streams", { category_id }));
    res.json(mapListWithIcons((data || []).slice(0, limit), c));
  } catch (error) {
    console.error("[XTREAM ERROR] Live fetch failed:", error.message);
    if (error.status === 401) {
      return res.status(403).json({ message: "Xtream credentials expired or invalid" });
    }
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/live", handleLive);
router.post("/live", handleLive);

/* ============== Recherche multi-types (cache + budget) ============== */
router.get("/search", ah(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ movies: [], series: [], live: [] });

  const c = await getCreds(req.user?.sub);
  if (!c) return res.status(404).json({ message: "No creds" });

  const kVod = mkey(req.user.sub, c.baseUrl, "vod");
  const kSer = mkey(req.user.sub, c.baseUrl, "series");
  const kLiv = mkey(req.user.sub, c.baseUrl, "live");

  let vod = mget(kVod);
  let ser = mget(kSer);
  let liv = mget(kLiv);

  const needsVod = !vod;
  const needsSer = !ser;
  const needsLiv = !liv;

  if (needsVod || needsSer || needsLiv) {
    try {
      const [vodRaw, serRaw, livRaw] = await Promise.all([
        needsVod ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams")) : null,
        needsSer ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series")) : null,
        needsLiv ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_streams")) : null,
      ]);

      if (needsVod) { vod = mapListWithIcons(vodRaw || [], c); mset(kVod, vod); }
      if (needsSer) { ser = mapListWithIcons(serRaw || [], c); mset(kSer, ser); }
      if (needsLiv) { liv = mapListWithIcons(livRaw || [], c); mset(kLiv, liv); }
    } catch (error) {
      console.error("[XTREAM ERROR] Search fetch failed:", error.message);
      if (error.status === 401) {
        return res.status(403).json({ message: "Xtream credentials expired or invalid" });
      }
      return res.status(503).json({ message: "Xtream service unavailable" });
    }
  }

  const ql = q.toLowerCase();
  const nameOf = (it) => it.name || it.title || it.stream_display_name || "";
  const match = (it) => nameOf(it).toString().toLowerCase().includes(ql);

  const movies = (vod || []).filter(match).slice(0, 50);
  const series = (ser || []).filter(match).slice(0, 50);
  const live   = (liv || []).filter(match).slice(0, 50);

  res.json({ movies, series, live });
}));

/* ============== Image proxy ============== */
router.get("/image", ah(async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });

  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ message: "url required" });

  const r = await fetchWithTimeout(String(url), 12000, {
    "User-Agent": "Mozilla/5.0 (NovaStream/1.0)",
    "Referer": c.baseUrl,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  }).catch(() => null);

  if (!r || !r.ok) return res.status(503).end();

  const ct = r.headers.get("content-type") || "image/jpeg";
  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "public, max-age=86400");
  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}));

/* ============== NEW: /xtream/stream-url (résolution URL de lecture) ============== */
/**
 * GET /xtream/stream-url?kind=movie|series|live&id=<tmdbId>&title=<opt>&year=<opt>
 * Réponse: { src }
 * - Pour movie/series: renvoie une URL *chemin Xtream* (ex: /movie/<user>/<pass>/<stream_id>.<ext>)
 *   qui sera mappée en proxy /api/stream/... par le VideoPlayer.jsx.
 * - Live non implémenté ici (retour 404).
 */
router.get("/stream-url", ah(async (req, res) => {
  const uid = req.user?.sub;
  if (!uid) return res.status(401).json({ error: "unauthorized" });

  const kind = String(req.query.kind || "").toLowerCase();
  const tmdbId = String(req.query.id || "").trim();
  const qTitle = String(req.query.title || "").trim();
  const qYear  = String(req.query.year  || "").trim();

  if (!kind || !tmdbId) return res.status(400).json({ error: "missing_params" });

  const c = await getCreds(uid);
  if (!c) return res.status(404).json({ error: "xtream_account_not_found" });

  if (kind === "live") {
    return res.status(404).json({ error: "live_resolution_not_implemented" });
  }

  // VOD/Series: lister les VOD puis matcher
  const list = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams")).catch(() => []);
  if (!Array.isArray(list) || !list.length) return res.status(404).json({ error: "vod_list_empty" });

  const nrm = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let hit = list.find((x) => String(x.tmdb_id || "").trim() === tmdbId);
  if (!hit && (qTitle || qYear)) {
    const want = nrm(qTitle);
    let cands = want ? list.filter((x) => nrm(x.name || x.title) === want) : [];
    if (qYear) {
      const y = cands.filter((x) => String(x.year || "") === String(qYear));
      if (y.length) cands = y;
    }
    hit = cands[0];
  }
  if (!hit?.stream_id) return res.status(404).json({ error: "vod_not_found" });

  // Récupérer l’extension
  let ext = "mp4";
  try {
    const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_info", { vod_id: hit.stream_id }));
    ext = (info?.info?.container_extension || info?.movie_data?.container_extension || "mp4").toLowerCase();
  } catch { /* fallback mp4 */ }

  // IMPORTANT: on renvoie un *chemin* Xtream, pas l’hôte → le lecteur le mappe vers /api/stream/...
  const src =
    `/${(kind === "series" ? "series" : "movie")}/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${encodeURIComponent(hit.stream_id)}.${ext}`;

  res.json({ src });
}));

export default router;
