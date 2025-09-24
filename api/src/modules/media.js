// api/src/modules/media.js
// TMDB + résolution play-src. Ajoute /media/resolve-by-title pour mapper un titre Xtream vers TMDB.

import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const TMDB_KEY = process.env.TMDB_API_KEY;

/* ===== Crypto ===== */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY doit faire 64 hex chars");
  return Buffer.from(hex, "hex");
}
function dec(blob) {
  const [v, ivb64, tagb64, ctb64] = String(blob).split(":");
  if (v !== "v1") throw new Error("Bad enc version");
  const key = getKey();
  const iv = Buffer.from(ivb64, "base64");
  const tag = Buffer.from(tagb64, "base64");
  const ct = Buffer.from(ctb64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/* ===== Xtream helpers ===== */
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s.replace(/\/player_api\.php.*$/i, "")
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
  const row = rows[0];
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
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "NovaStream/1.0" } });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP_${r.status}`); e.body = t; e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { const e = new Error("BAD_JSON"); e.body = t; throw e; }
}

/* ===== Matching helpers ===== */
const LANG_TAGS = [
  "FR","VF","VO","VOSTFR","VOST","STFR","TRUEFRENCH","FRENCH","SUBFRENCH","SUBFR","SUB","SUBS",
  "EN","ENG","DE","ES","IT","PT","NL","RU","PL","TR","TURK","AR","ARAB","ARABIC","LAT","LATINO","DUAL","MULTI"
];
function dropLeadingTags(raw = "") {
  let s = String(raw).trim();
  s = s.replace(/^(?:\s*(?:\|[^|]*\||\[[^\]]*\]|\([^\)]*\)))+\s*/i, "");
  const tag = `(?:${LANG_TAGS.join("|")})`;
  const sep = `(?:\\s*[|:/\\\\\\-·•]\\s*|\\s+)`;
  const seq = new RegExp(`^(?:${tag})(?:${sep}(?:${tag}))*${sep}*`, "i");
  s = s.replace(seq, "");
  return s.trimStart();
}
function stripTitle(raw = "") {
  let s = dropLeadingTags(raw);
  s = s.replace(/[|._]/g, " ");
  s = s.replace(/\s-\s/g, " ");
  s = s.replace(/\[[^\]]*\]|\([^\)]*\)/g, " ");
  s = s.replace(/\b(19|20)\d{2}\b/g, " ");
  s = s.replace(/\bS\d{1,2}E\d{1,2}\b/gi, " ");
  s = s.replace(/\b(2160p|1080p|720p|480p|x264|x265|h264|h265|hevc|hdr|webrip|b[dr]rip|dvdrip|cam|ts|multi|truefrench|french|vostfr|vost|stfr|vf|vo)\b/gi, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
function yearFromStrings(...cands) {
  for (const c of cands) {
    const m = String(c || "").match(/\b(19|20)\d{2}\b/);
    if (m) return Number(m[0]);
  }
  return undefined;
}
function similarity(a, b) {
  const A = new Set(stripTitle(a).toLowerCase().split(" ").filter(Boolean));
  const B = new Set(stripTitle(b).toLowerCase().split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.max(A.size, B.size);
}
function yearPenalty(yearCand, dateStr) {
  if (!yearCand || !dateStr) return 0;
  const y = Number(String(dateStr).slice(0, 4));
  if (!y) return 0;
  const d = Math.abs(yearCand - y);
  return Math.min(d * 0.03, 0.3);
}

/* ===== TMDB ===== */
const TMDB_BASE = "https://api.themoviedb.org/3";
async function tmdbSearchMovie(q, year) {
  const u = new URL(`${TMDB_BASE}/search/movie`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("query", q);
  u.searchParams.set("include_adult", "true");
  u.searchParams.set("language", "fr-FR");
  if (year) u.searchParams.set("year", String(year));
  return fetchJson(u.toString());
}
async function tmdbSearchTV(q, year) {
  const u = new URL(`${TMDB_BASE}/search/tv`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("query", q);
  u.searchParams.set("include_adult", "true");
  u.searchParams.set("language", "fr-FR");
  if (year) u.searchParams.set("first_air_date_year", String(year));
  return fetchJson(u.toString());
}
async function tmdbDetails(kind, id) {
  const u = new URL(`${TMDB_BASE}/${kind === "movie" ? "movie" : "tv"}/${id}`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("language", "fr-FR");
  u.searchParams.set("append_to_response", "videos");
  u.searchParams.set("include_video_language", "fr,en,null");
  return fetchJson(u.toString());
}
function pickBestTrailer(videos = []) {
  const list = (videos || []).filter((v) => v.site === "YouTube");
  if (!list.length) return null;
  const score = (v) => {
    let s = 0;
    if (v.type === "Trailer") s += 3;
    if (v.type === "Teaser") s += 2;
    if (v.official) s += 2;
    const lang = (v.iso_639_1 || "").toLowerCase();
    if (lang === "fr") s += 2;
    if (lang === "en") s += 1;
    return s;
  };
  const best = [...list].sort((a, b) => score(b) - score(a))[0];
  return best ? { key: best.key, name: best.name, url: `https://www.youtube.com/watch?v=${best.key}` } : null;
}
const ytEmbed = (key) => (key ? `https://www.youtube.com/embed/${key}?rel=0&modestbranding=1` : null);
const img = (p, size = "w500") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
function formatMovie(det) {
  const trailer = pickBestTrailer(det?.videos?.results || []);
  return {
    kind: "movie",
    tmdb_id: det.id,
    title: det.title || det.original_title || null,
    original_title: det.original_title || null,
    overview: det.overview || null,
    vote_average: det.vote_average ?? null,
    vote_count: det.vote_count ?? null,
    release_date: det.release_date || null,
    runtime: det.runtime ?? null,
    poster_url: img(det.poster_path, "w500"),
    backdrop_url: img(det.backdrop_path, "w1280"),
    trailer: trailer ? { ...trailer, embed_url: ytEmbed(trailer.key) } : null,
    genres: (det.genres || []).map((g) => g.name),
    data: det,
  };
}
function formatSeries(det) {
  const trailer = pickBestTrailer(det?.videos?.results || []);
  return {
    kind: "series",
    tmdb_id: det.id,
    title: det.name || det.original_name || null,
    original_title: det.original_name || null,
    overview: det.overview || null,
    vote_average: det.vote_average ?? null,
    vote_count: det.vote_count ?? null,
    first_air_date: det.first_air_date || det.release_date || null,
    number_of_seasons: det.number_of_seasons ?? null,
    number_of_episodes: det.number_of_episodes ?? null,
    poster_url: img(det.poster_path, "w500"),
    backdrop_url: img(det.backdrop_path, "w1280"),
    trailer: trailer ? { ...trailer, embed_url: ytEmbed(trailer.key) } : null,
    genres: (det.genres || []).map((g) => g.name),
    data: det,
  };
}

/* ===== Meta endpoints (TMDB id direct) ===== */
router.get("/movie/:id", async (req, res, next) => {
  try {
    const det = await tmdbDetails("movie", req.params.id);
    res.json(formatMovie(det));
  } catch (e) { next(e); }
});
router.get("/series/:id", async (req, res, next) => {
  try {
    const det = await tmdbDetails("tv", req.params.id);
    res.json(formatSeries(det));
  } catch (e) { next(e); }
});

/* ===== Resolver par titre+année (pour flux Xtream sans tmdb_id) ===== */
// GET /media/resolve-by-title?kind=movie|series&title=...&year=YYYY
router.get("/resolve-by-title", async (req, res, next) => {
  try {
    const kind = String(req.query.kind || "").toLowerCase();
    const titleRaw = String(req.query.title || "");
    const year = Number(req.query.year || 0) || undefined;
    if (!kind || !titleRaw) return res.status(400).json({ error: "missing_params" });

    const q = stripTitle(titleRaw);
    if (!q) return res.status(404).json({ error: "no_match" });

    if (kind === "movie") {
      const sr = await tmdbSearchMovie(q, year);
      let best = null;
      for (const r of (sr?.results || []).slice(0, 10)) {
        const score = similarity(q, r.title || r.original_title || "") - yearPenalty(year, r.release_date);
        if (!best || score > best.score) best = { score, r };
      }
      if (!best || best.score <= 0.15) return res.status(404).json({ error: "no_match" });
      const det = await tmdbDetails("movie", best.r.id);
      return res.json(formatMovie(det));
    }

    if (kind === "series") {
      const sr = await tmdbSearchTV(q, year);
      let best = null;
      for (const r of (sr?.results || []).slice(0, 10)) {
        const score = similarity(q, r.name || r.original_name || "") - yearPenalty(year, r.first_air_date);
        if (!best || score > best.score) best = { score, r };
      }
      if (!best || best.score <= 0.12) return res.status(404).json({ error: "no_match" });
      const det = await tmdbDetails("tv", best.r.id);
      return res.json(formatSeries(det));
    }

    return res.status(400).json({ error: "bad_kind" });
  } catch (e) { next(e); }
});

/* ===== play-src: choisit l’URL de lecture locale ===== */
// GET /media/play-src?kind=movie|series|live&xid=<streamId>&title=<t>&year=<yyyy>&url=<direct>
router.get("/play-src", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const kind  = String(req.query.kind || "").toLowerCase();
    const xid   = req.query.xid ? String(req.query.xid) : "";
    const title = String(req.query.title || "");
    const year  = Number(req.query.year || 0) || undefined;
    const directUrl = req.query.url ? String(req.query.url) : "";

    if (directUrl) return res.status(404).json({ error: "direct_url_proxy_not_implemented" });

    if (xid && (kind === "movie" || kind === "series")) {
      return res.json({ src: `/api/stream/vodmp4/${encodeURIComponent(xid)}` });
    }
    if (xid && kind === "live") {
      return res.json({ src: `/api/stream/hls/live/${encodeURIComponent(xid)}.m3u8` });
    }

    // fallback: on n’essaie pas de déduire automatiquement un stream_id ici
    if (!title) return res.status(404).json({ error: "no_source" });

    // si besoin, côté front, utilisez /media/resolve-by-title pour l’affichage uniquement
    return res.status(404).json({ error: "no_source" });
  } catch (e) { next(e); }
});

export default router;
