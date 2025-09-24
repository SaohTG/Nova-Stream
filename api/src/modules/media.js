// api/src/modules/media.js
// Métadonnées TMDB + sélection de source serveur.
// Ne divulgue jamais user/pass Xtream.

import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const TMDB_KEY = process.env.TMDB_API_KEY;

/* ================= Crypto (partagé) ================= */
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

/* ================= TMDB helpers ================= */
async function fetchJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "NovaStream/1.0" } });
  const t = await r.text();
  if (!r.ok) { const e = new Error(`HTTP_${r.status}`); e.body = t; e.status = r.status; throw e; }
  try { return JSON.parse(t); } catch { const e = new Error("BAD_JSON"); e.body = t; throw e; }
}
const TMDB_BASE = "https://api.themoviedb.org/3";
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

/* ================= Meta endpoints ================= */
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

/* ================= play-src: renvoie une URL locale /api/stream/* ================= */
// GET /media/play-src?kind=movie|series|live&xid=<streamId>&url=<direct-optional>
router.get("/play-src", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const kind = String(req.query.kind || "").toLowerCase();
    const xid = req.query.xid ? String(req.query.xid) : "";
    const directUrl = req.query.url ? String(req.query.url) : "";

    // URL directe fournie par ton serveur (optionnel)
    if (directUrl) {
      // Si tu ajoutes plus tard un proxy HTTP dans /api/stream, renvoie /api/stream/http?u=...
      return res.status(404).json({ error: "direct_url_proxy_not_implemented" });
    }

    if (xid && (kind === "movie" || kind === "series")) {
      return res.json({ src: `/api/stream/vodmp4/${encodeURIComponent(xid)}` });
    }
    if (xid && kind === "live") {
      return res.json({ src: `/api/stream/hls/live/${encodeURIComponent(xid)}.m3u8` });
    }

    return res.status(404).json({ error: "no_source" });
  } catch (e) { next(e); }
});

export default router;
