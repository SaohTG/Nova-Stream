// api/src/modules/media.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import { Readable } from "node:stream";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const TMDB_KEY = process.env.TMDB_API_KEY;
const TTL = Number(process.env.MEDIA_TTL_SECONDS || 7 * 24 * 3600); // 7 jours

/* ===== Crypto (compat xtream.js/stream.js) ===== */
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

/* ===== DB cache TMDB <-> Xtream ===== */
async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media_cache (
      kind text NOT NULL,
      xtream_id text NOT NULL,
      tmdb_id integer,
      title text,
      data jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (kind, xtream_id)
    );
  `);
}
async function getCache(kind, xtreamId) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT tmdb_id, title, data, EXTRACT(EPOCH FROM (now()-updated_at)) AS age
     FROM media_cache WHERE kind=$1 AND xtream_id=$2 LIMIT 1`,
    [kind, String(xtreamId)]
  );
  const row = rows[0];
  if (!row) return null;
  if (Number(row.age) > TTL) return null;
  return { tmdb_id: row.tmdb_id, title: row.title, data: row.data };
}
async function putCache(kind, xtreamId, tmdbId, title, data) {
  await ensureTables();
  await pool.query(
    `INSERT INTO media_cache (kind, xtream_id, tmdb_id, title, data, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (kind, xtream_id) DO UPDATE
       SET tmdb_id=EXCLUDED.tmdb_id, title=EXCLUDED.title, data=EXCLUDED.data, updated_at=now()`,
    [kind, String(xtreamId), tmdbId ?? null, title ?? null, data ?? {}]
  );
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
async function fetchWithTimeout(url, ms = 12000, headers = {}, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers, ...init });
    return r;
  } finally { clearTimeout(t); }
}
async function fetchJson(url) {
  const r = await fetchWithTimeout(url, 12000, { "User-Agent": "NovaStream/1.0" });
  const txt = await r.text();
  if (!r.ok) { const e = new Error(`HTTP_${r.status}`); e.status = r.status; e.body = txt; throw e; }
  try { return JSON.parse(txt); } catch { const e = new Error("BAD_JSON"); e.body = txt; throw e; }
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
async function tmdbSearchMulti(q) {
  const u = new URL(`${TMDB_BASE}/search/multi`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("query", q);
  u.searchParams.set("include_adult", "true");
  u.searchParams.set("language", "fr-FR");
  return fetchJson(u.toString());
}
async function tmdbDetails(kind, id) {
  const u = new URL(`${TMDB_BASE}/${kind === "movie" ? "movie" : "tv"}/${id}`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("language", "fr-FR");
  u.searchParams.set("append_to_response", "external_ids,credits,videos");
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

/* ===== Format sortie ===== */
const img = (p, size = "w500") => (p ? `https://image.tmdb.org/t/p/${size}${p}` : null);
function formatMoviePayload(xtreamId, det) {
  const trailer = pickBestTrailer(det?.videos?.results || []);
  return {
    kind: "movie",
    xtream_id: String(xtreamId),
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
function formatSeriesPayload(xtreamId, det) {
  const trailer = pickBestTrailer(det?.videos?.results || []);
  return {
    kind: "series",
    xtream_id: String(xtreamId),
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

/* ===== Resolvers meta (Xtream -> TMDB) ===== */
async function resolveMovie(userId, vodId, { refresh = false } = {}) {
  if (!refresh) {
    const cached = await getCache("movie", vodId);
    if (cached?.data) return cached.data;
  }
  const creds = await getCreds(userId);
  if (!creds) throw Object.assign(new Error("No Xtream creds"), { status: 404 });

  const info = await fetchJson(
    buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_info", { vod_id: vodId })
  );

  let tmdbId = Number(info?.info?.tmdb_id || info?.movie_data?.tmdb_id || 0) || null;

  let titleCand =
    info?.movie_data?.name ||
    info?.info?.name ||
    info?.movie_data?.movie_name ||
    info?.info?.o_name ||
    info?.info?.title ||
    "";
  const yearCand =
    Number(info?.movie_data?.releasedate?.slice?.(0, 4)) ||
    Number(info?.info?.releasedate?.slice?.(0, 4)) ||
    yearFromStrings(info?.movie_data?.releasedate, info?.info?.releasedate, titleCand);

  if (!tmdbId && TMDB_KEY && titleCand) {
    const queries = [titleCand, stripTitle(titleCand)];
    let best = null;
    for (const q of queries) {
      const sr = await tmdbSearchMovie(q, yearCand);
      for (const r of (sr?.results || []).slice(0, 10)) {
        const score = similarity(q, r.title || r.original_title || "") - yearPenalty(yearCand, r.release_date);
        if (!best || score > best.score) best = { score, r };
      }
    }
    if (best && best.score > 0.2) tmdbId = best.r.id;
  }

  if (!tmdbId) {
    const payload = {
      kind: "movie",
      xtream_id: String(vodId),
      title: titleCand || null,
      overview: null,
      vote_average: null,
      poster_url: null,
      backdrop_url: null,
      trailer: null,
      source: { xtream_only: true, info },
    };
    await putCache("movie", vodId, null, titleCand || null, payload);
    return payload;
  }

  const det = await tmdbDetails("movie", tmdbId);
  const payload = formatMoviePayload(vodId, det);
  await putCache("movie", vodId, tmdbId, payload.title, payload);
  return payload;
}

async function resolveSeries(userId, seriesId, { refresh = false } = {}) {
  if (!refresh) {
    const cached = await getCache("series", seriesId);
    if (cached?.data) return cached.data;
  }
  const creds = await getCreds(userId);
  if (!creds) throw Object.assign(new Error("No Xtream creds"), { status: 404 });

  const info = await fetchJson(
    buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series_info", { series_id: seriesId })
  );

  let tmdbId = Number(info?.info?.tmdb_id || 0) || null;

  const anyEpisodeTitle = (() => {
    const epObj = info?.episodes || {};
    const seasons = Object.keys(epObj);
    if (seasons.length) {
      const firstSeason = epObj[seasons[0]];
      const firstEp = Array.isArray(firstSeason) ? firstSeason[0] : null;
      return firstEp?.title || firstEp?.name || "";
    }
    return "";
  })();

  const rawTitle =
    info?.info?.name ||
    info?.info?.series_name ||
    info?.info?.o_name ||
    info?.info?.title ||
    anyEpisodeTitle ||
    "";

  const yearCand =
    Number(info?.info?.releasedate?.slice?.(0, 4)) ||
    Number(info?.info?.releaseDate?.slice?.(0, 4)) ||
    Number(info?.info?.first_air_date?.slice?.(0, 4)) ||
    yearFromStrings(info?.info?.releasedate, info?.info?.releaseDate, info?.info?.first_air_date, rawTitle);

  const base = dropLeadingTags(rawTitle).trim();
  const lastSeg = base.split(" - ").pop().trim();

  const queries = Array.from(new Set([
    rawTitle, base, lastSeg, stripTitle(rawTitle), stripTitle(base), stripTitle(lastSeg),
  ])).filter(Boolean);

  if (!tmdbId && TMDB_KEY && queries.length) {
    let best = null;

    for (const q of queries) {
      const sr = await tmdbSearchTV(q, yearCand);
      for (const r of (sr?.results || []).slice(0, 10)) {
        const score = similarity(q, r.name || r.original_name || "") - yearPenalty(yearCand, r.first_air_date);
        if (!best || score > best.score) best = { score, r };
      }
    }

    if (!best || best.score <= 0.1) {
      for (const q of queries) {
        const sr = await tmdbSearchMulti(q);
        const tvOnly = (sr?.results || []).filter((r) => r.media_type === "tv");
        for (const r of tvOnly.slice(0, 10)) {
          const score = similarity(q, r.name || r.original_name || "") - yearPenalty(yearCand, r.first_air_date);
          if (!best || score > best.score) best = { score, r };
        }
      }
    }

    if (best && best.score > 0.1) tmdbId = best.r.id;
  }

  if (!tmdbId) {
    const payload = {
      kind: "series",
      xtream_id: String(seriesId),
      title: stripTitle(rawTitle) || null,
      overview: null,
      vote_average: null,
      poster_url: null,
      backdrop_url: null,
      trailer: null,
      source: { xtream_only: true, info },
    };
    await putCache("series", seriesId, null, stripTitle(rawTitle) || null, payload);
    return payload;
  }

  const det = await tmdbDetails("tv", tmdbId);
  const payload = formatSeriesPayload(seriesId, det);
  await putCache("series", seriesId, tmdbId, payload.title, payload);
  return payload;
}

/* ===== Streaming helpers ===== */
function streamCandidates(baseUrl, username, password, kind, id) {
  const root = baseUrl;
  if (kind === "live") return [
    `${root}/live/${username}/${password}/${id}.m3u8`,
    `${root}/live/${username}/${password}/${id}.ts`,
  ];
  if (kind === "movie") return [
    `${root}/movie/${username}/${password}/${id}.m3u8`,
    `${root}/movie/${username}/${password}/${id}.mp4`,
    `${root}/movie/${username}/${password}/${id}.ts`,
    `${root}/movie/${username}/${password}/${id}.mkv`,
  ];
  return [
    `${root}/series/${username}/${password}/${id}.m3u8`,
    `${root}/series/${username}/${password}/${id}.mp4`,
    `${root}/series/${username}/${password}/${id}.ts`,
    `${root}/series/${username}/${password}/${id}.mkv`,
  ];
}
async function firstReachable(urls, headers = {}) {
  for (const u of urls) {
    try {
      let r = await fetchWithTimeout(u, 6000, { "User-Agent": "VLC/3.0", ...headers }, { method: "HEAD" });
      if (!r.ok) r = await fetchWithTimeout(u, 6000, { "User-Agent": "VLC/3.0", Range: "bytes=0-0", ...headers }, { method: "GET" });
      if (r.ok) return u;
    } catch {}
  }
  return null;
}
// Relax: autorise CDN/redirections par défaut (active le strict via MEDIA_PROXY_STRICT=1)
function assertAllowed(url, baseUrl) {
  const strict = (process.env.MEDIA_PROXY_STRICT || "0") === "1";
  if (!strict) return;
  const want = new URL(baseUrl);
  const got = new URL(url);
  if (want.hostname !== got.hostname) {
    const e = new Error("forbidden host"); e.status = 400; throw e;
  }
}

/* ===== URL directe (debug) ===== */
router.get("/:kind(movie|series|live)/:id/stream-url", async (req, res, next) => {
  try {
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.status(404).json({ error: "no-xtream" });
    const url = await firstReachable(
      streamCandidates(creds.baseUrl, creds.username, creds.password, req.params.kind, req.params.id),
      { "Referer": creds.baseUrl + "/" }
    );
    if (!url) return res.status(404).json({ error: "no-src" });
    res.json({ url });
  } catch (e) { next(e); }
});

/* ===== HLS proxifié avec réécriture ===== */
router.get("/:kind(movie|series|live)/:id/hls.m3u8", async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const m3u8Url = await firstReachable(
      streamCandidates(creds.baseUrl, creds.username, creds.password, kind, id).filter(u => u.endsWith(".m3u8")),
      { "Referer": creds.baseUrl + "/" }
    );
    if (!m3u8Url) return res.status(404).json({ error: "no-hls" });

    const up = await fetchWithTimeout(m3u8Url, 12000, {
      "User-Agent": "VLC/3.0",
      "Referer": creds.baseUrl + "/",
      "Accept": "application/vnd.apple.mpegurl,application/x-mpegURL,*/*"
    });
    if (!up.ok) { const t = await up.text(); const e = new Error(`UPSTREAM_${up.status}`); e.body = t; e.status = 502; throw e; }
    const origin = new URL(m3u8Url);
    const text = await up.text();

    const body = text.split(/\r?\n/).map((line) => {
      if (line.startsWith("#EXT-X-KEY")) {
        return line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const abs = new URL(uri, origin).toString();
          return `URI="/api/media/proxy?url=${encodeURIComponent(abs)}"`;
        });
      }
      if (!line || line.startsWith("#")) return line;
      const abs = new URL(line, origin).toString();
      return `/api/media/proxy?url=${encodeURIComponent(abs)}`;
    }).join("\n");

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  } catch (e) { next(e); }
});

/* ===== Proxy générique sécurisé (segments .ts, .m4s, clés, mp4, mkv) ===== */
router.get("/proxy", async (req, res, next) => {
  try {
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const url = (req.query.url || "").toString();
    if (!url || !/^https?:\/\//i.test(url)) { const e = new Error("missing url"); e.status = 400; throw e; }
    assertAllowed(url, creds.baseUrl);

    const headers = {
      "User-Agent": "VLC/3.0",
      "Referer": creds.baseUrl + "/",
      "Accept": "*/*",
    };
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];

    const up = await fetchWithTimeout(url, 15000, headers);
    if (!up) return res.status(502).end();

    const ct = up.headers.get("content-type");
    const cr = up.headers.get("content-range");
    const ar = up.headers.get("accept-ranges");
    const cl = up.headers.get("content-length");
    if (ct) res.setHeader("Content-Type", ct);
    if (cr) res.setHeader("Content-Range", cr);
    if (ar) res.setHeader("Accept-Ranges", ar);
    if (cl) res.setHeader("Content-Length", cl);
    res.setHeader("Cache-Control", "no-store");
    res.status(up.status);
    if (up.body) Readable.fromWeb(up.body).pipe(res);
    else res.end();
  } catch (e) { next(e); }
});

/* ===== Fallback progressif MP4/TS ===== */
router.get("/:kind(movie|series|live)/:id/file", async (req, res, next) => {
  try {
    const { kind, id } = req.params;
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const fileUrl = await firstReachable(
      streamCandidates(creds.baseUrl, creds.username, creds.password, kind, id).filter(u => /\.(mp4|ts|mkv)(\?|$)/i.test(u)),
      { "Referer": creds.baseUrl + "/" }
    );
    if (!fileUrl) return res.status(404).json({ error: "no-file" });

    req.url = `/api/media/proxy?url=${encodeURIComponent(fileUrl)}`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});

/* ===== Meta endpoints (support ?refresh=1) ===== */
router.get("/movie/:id", async (req, res, next) => {
  try {
    const out = await resolveMovie(req.user?.sub, req.params.id, { refresh: req.query.refresh === "1" });
    res.json(out);
  } catch (e) { e.status = e.status || 500; next(e); }
});
router.get("/series/:id", async (req, res, next) => {
  try {
    const out = await resolveSeries(req.user?.sub, req.params.id, { refresh: req.query.refresh === "1" });
    res.json(out);
  } catch (e) { e.status = e.status || 500; next(e); }
});

/* ===== ID-less helpers (vod_id -> stream_id, episode -> stream_id) ===== */
async function getVodStreamId(userId, vodId) {
  const creds = await getCreds(userId);
  if (!creds) throw Object.assign(new Error("no-xtream"), { status: 404 });
  const info = await fetchJson(
    buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_info", { vod_id: vodId })
  );
  const sid = Number(info?.movie_data?.stream_id || info?.info?.stream_id || 0);
  if (!sid) throw Object.assign(new Error("no-stream-id"), { status: 404 });
  return { streamId: String(sid) };
}
async function getEpisodeStreamId(userId, seriesId, seasonNum, episodeNum) {
  const creds = await getCreds(userId);
  if (!creds) throw Object.assign(new Error("no-xtream"), { status: 404 });
  const info = await fetchJson(
    buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series_info", { series_id: seriesId })
  );
  const seasons = info?.episodes || {};
  const key = String(seasonNum);
  const arr = Array.isArray(seasons[key]) ? seasons[key] : [];
  const ep = arr.find(e => Number(e.episode_num) === Number(episodeNum)) || arr[Number(episodeNum) - 1];
  const sid = Number(ep?.id || 0);
  if (!sid) throw Object.assign(new Error("no-episode"), { status: 404 });
  return { streamId: String(sid) };
}
router.get("/movie/vod/:vodId/hls.m3u8", async (req, res, next) => {
  try {
    const { streamId } = await getVodStreamId(req.user?.sub, req.params.vodId);
    req.url = `/api/media/movie/${streamId}/hls.m3u8`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/movie/vod/:vodId/file", async (req, res, next) => {
  try {
    const { streamId } = await getVodStreamId(req.user?.sub, req.params.vodId);
    req.url = `/api/media/movie/${streamId}/file`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/movie/vod/:vodId/stream-url", async (req, res, next) => {
  try {
    const { streamId } = await getVodStreamId(req.user?.sub, req.params.vodId);
    req.url = `/api/media/movie/${streamId}/stream-url`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/series/:seriesId/season/:s/episode/:e/hls.m3u8", async (req, res, next) => {
  try {
    const { streamId } = await getEpisodeStreamId(req.user?.sub, req.params.seriesId, req.params.s, req.params.e);
    req.url = `/api/media/series/${streamId}/hls.m3u8`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/series/:seriesId/season/:s/episode/:e/file", async (req, res, next) => {
  try {
    const { streamId } = await getEpisodeStreamId(req.user?.sub, req.params.seriesId, req.params.s, req.params.e);
    req.url = `/api/media/series/${streamId}/file`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});
router.get("/series/:seriesId/season/:s/episode/:e/stream-url", async (req, res, next) => {
  try {
    const { streamId } = await getEpisodeStreamId(req.user?.sub, req.params.seriesId, req.params.s, req.params.e);
    req.url = `/api/media/series/${streamId}/stream-url`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});

/* ===== Resolver par titre (pour affichage TMDB depuis un XID) ===== */
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
      return res.json(formatMoviePayload("xid", det));
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
      return res.json(formatSeriesPayload("xid", det));
    }

    return res.status(400).json({ error: "bad_kind" });
  } catch (e) { next(e); }
});

/* ===== play-src: retourne une URL locale lisible par le lecteur ===== */
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

    if (directUrl) return res.json({ src: `/api/media/proxy?url=${encodeURIComponent(directUrl)}` });

    if (xid && (kind === "movie" || kind === "series")) {
      return res.json({ src: `/api/stream/vodmp4/${encodeURIComponent(xid)}` });
    }
    if (xid && kind === "live") {
      return res.json({ src: `/api/stream/hls/live/${encodeURIComponent(xid)}.m3u8` });
    }

    // Fallback: recherche Xtream par titre (le fournisseur n’expose pas tmdb_id)
    if (!title) return res.status(404).json({ error: "no_source" });

    const creds = await getCreds(uid);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    if (kind === "movie") {
      const list = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_streams"));
      if (!Array.isArray(list) || !list.length) return res.status(404).json({ error: "vod_list_empty" });

      const want = stripTitle(title);
      let best = null;
      for (const r of list) {
        const cand = r.name || r.title || r.stream_display_name || "";
        let score = similarity(want, cand);
        const yCand = yearFromStrings(r.name, r.title, r.stream_display_name, r.year);
        if (year) score -= yearPenalty(year, yCand ? `${yCand}-01-01` : null);
        if (!best || score > best.score) best = { score, r };
      }
      if (best && best.score > 0.10 && best.r.stream_id) {
        return res.json({ src: `/api/stream/vodmp4/${encodeURIComponent(best.r.stream_id)}` });
      }
      return res.status(404).json({ error: "vod_not_found" });
    }

    if (kind === "live") {
      const list = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_live_streams"));
      if (!Array.isArray(list) || !list.length) return res.status(404).json({ error: "live_list_empty" });

      const want = stripTitle(title);
      let best = null;
      for (const r of list) {
        const cand = r.name || r.title || r.stream_display_name || "";
        const score = similarity(want, cand);
        if (!best || score > best.score) best = { score, r };
      }
      if (best && best.score > 0.10 && best.r.stream_id) {
        return res.json({ src: `/api/stream/hls/live/${encodeURIComponent(best.r.stream_id)}.m3u8` });
      }
      return res.status(404).json({ error: "live_not_found" });
    }

    if (kind === "series") {
      const list = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series"));
      if (!Array.isArray(list) || !list.length) return res.status(404).json({ error: "series_list_empty" });

      const want = stripTitle(title);
      let best = null;
      for (const r of list) {
        const cand = r.name || r.title || r.stream_display_name || "";
        let score = similarity(want, cand);
        const yCand = yearFromStrings(r.name, r.title, r.stream_display_name, r.year);
        if (year) score -= yearPenalty(year, yCand ? `${yCand}-01-01` : null);
        if (!best || score > best.score) best = { score, r };
      }
      const seriesId = best?.r?.series_id;
      if (!seriesId) return res.status(404).json({ error: "series_not_found" });

      const info = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series_info", { series_id: seriesId }));
      const epsBySeason = info?.episodes || {};
      const seasons = Object.keys(epsBySeason).map(n => Number(n)).filter(Number.isFinite).sort((a,b)=>a-b);
      for (const s of seasons) {
        const eps = Array.isArray(epsBySeason[String(s)]) ? epsBySeason[String(s)] : [];
        if (eps.length) {
          const epId = eps[0]?.id;
          if (epId) return res.json({ src: `/api/stream/hls/series/${encodeURIComponent(epId)}.m3u8` });
        }
      }
      return res.status(404).json({ error: "series_no_episode" });
    }

    return res.status(404).json({ error: "no_source" });
  } catch (e) { next(e); }
});

export default router;
