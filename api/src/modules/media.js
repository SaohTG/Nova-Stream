// api/src/modules/media.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ---------- DB ---------- */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_meta (
      kind text NOT NULL,              -- 'movie' | 'series'
      xtream_id text NOT NULL,
      tmdb_id integer,
      title text,
      overview text,
      vote_average numeric,
      vote_count integer,
      poster_path text,
      backdrop_path text,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, xtream_id)
    );
  `);
}

/* ---------- Xtream helpers (copie minimale) ---------- */
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function buildPlayerApi(baseUrl, username, password, action, extra = {}) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  if (action) u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
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

/* ---------- TMDB helpers ---------- */
const TMDB = {
  key() { return process.env.TMDB_API_KEY || ""; },
  async searchMovie(q, year) {
    const base = `https://api.themoviedb.org/3/search/movie?api_key=${this.key()}&language=fr-FR&query=${encodeURIComponent(q)}`;
    const url = year ? `${base}&year=${year}` : base;
    const j = await fetchJson(url).catch(() => ({}));
    return Array.isArray(j.results) ? j.results : [];
  },
  async searchTv(q, yearFirstAir) {
    const base = `https://api.themoviedb.org/3/search/tv?api_key=${this.key()}&language=fr-FR&query=${encodeURIComponent(q)}`;
    const url = yearFirstAir ? `${base}&first_air_date_year=${yearFirstAir}` : base;
    const j = await fetchJson(url).catch(() => ({}));
    return Array.isArray(j.results) ? j.results : [];
  },
};

const norm = (s) => (s || "").toString()
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/* ---------- core: get + cache ---------- */
async function resolveFromXtream(kind, id, creds) {
  if (kind === "movie") {
    const info = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_info", { vod_id: id }));
    const t = info?.movie_data?.name || info?.movie_data?.title || info?.info?.name || info?.info?.movie_name || "";
    const yRaw = info?.movie_data?.releasedate || info?.info?.releasedate || info?.info?.releaseDate || "";
    const year = String(yRaw || "").slice(0, 4).replace(/\D/g, "") || "";
    return { title: t, year };
  }
  // series
  const info = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series_info", { series_id: id }));
  const t = info?.info?.name || info?.info?.title || info?.info?.o_name || "";
  const yRaw = info?.info?.releaseDate || info?.info?.release_date || "";
  const year = String(yRaw || "").slice(0, 4).replace(/\D/g, "") || "";
  return { title: t, year };
}

async function fetchTmdb(kind, title, year) {
  if (!TMDB.key()) return null;
  const q = (title || "").trim();
  if (!q) return null;

  const list = kind === "movie" ? await TMDB.searchMovie(q, year) : await TMDB.searchTv(q, year);
  if (!list.length) {
    // retry no-year
    const alt = kind === "movie" ? await TMDB.searchMovie(q) : await TMDB.searchTv(q);
    if (!alt.length) return null;
    return alt[0];
  }
  // pick best by normalized similarity
  const qn = norm(q);
  let best = list[0], bestScore = 0;
  for (const it of list) {
    const name = norm(it.title || it.name || "");
    const score = name && qn ? (name === qn ? 3 : (name.includes(qn) || qn.includes(name) ? 2 : 1)) : 0;
    if (score > bestScore) { best = it; bestScore = score; }
  }
  return best;
}

/* GET /api/media/:kind/:id
   kind ∈ movie|series
   - lit cache si < 7j
   - sinon résout via Xtream -> recherche TMDB -> upsert -> retourne
*/
router.get("/:kind/:id", async (req, res, next) => {
  try {
    await ensureTables();
    const { kind, id } = req.params;
    if (!["movie", "series"].includes(kind)) return res.status(400).json({ message: "bad kind" });

    // cache hit?
    const { rows } = await pool.query(
      `SELECT * FROM media_meta
       WHERE kind=$1 AND xtream_id=$2
         AND updated_at > now() - interval '7 days'`,
      [kind, String(id)]
    );
    if (rows.length) return res.json(rows[0]);

    // need refresh
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.status(404).json({ message: "No Xtream creds" });

    const base = await resolveFromXtream(kind, id, creds);
    const tm = await fetchTmdb(kind, base.title, base.year);

    const data = tm ? {
      tmdb_id: tm.id,
      title: tm.title || tm.name || base.title || "",
      overview: tm.overview || "",
      vote_average: tm.vote_average ?? null,
      vote_count: tm.vote_count ?? null,
      poster_path: tm.poster_path || null,
      backdrop_path: tm.backdrop_path || null,
    } : {
      tmdb_id: null,
      title: base.title || "",
      overview: "",
      vote_average: null,
      vote_count: null,
      poster_path: null,
      backdrop_path: null,
    };

    const up = await pool.query(
      `INSERT INTO media_meta (kind, xtream_id, tmdb_id, title, overview, vote_average, vote_count, poster_path, backdrop_path, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (kind, xtream_id) DO UPDATE SET
         tmdb_id=EXCLUDED.tmdb_id,
         title=EXCLUDED.title,
         overview=EXCLUDED.overview,
         vote_average=EXCLUDED.vote_average,
         vote_count=EXCLUDED.vote_count,
         poster_path=EXCLUDED.poster_path,
         backdrop_path=EXCLUDED.backdrop_path,
         updated_at=now()
       RETURNING *`,
      [kind, String(id), data.tmdb_id, data.title, data.overview, data.vote_average, data.vote_count, data.poster_path, data.backdrop_path]
    );

    return res.json(up.rows[0]);
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

export default router;
