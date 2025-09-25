// api/src/modules/media.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { Readable } from "node:stream";
import dns from "node:dns/promises";
import { spawn } from "node:child_process";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const TMDB_KEY = process.env.TMDB_API_KEY;
const TTL = Number(process.env.MEDIA_TTL_SECONDS || 7 * 24 * 3600);

/* ========== Utils ========== */
const b64u = (s) =>
  Buffer.from(String(s), "utf8")
    .toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
const fromB64u = (s) => {
  let t = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  return Buffer.from(t, "base64").toString("utf8");
};

/* ========== Auth minimale ========== */
function parseCookies(req) {
  if (req.cookies) return req.cookies;
  const h = req.headers.cookie;
  if (!h) return {};
  return h.split(";").reduce((a, p) => {
    const i = p.indexOf("="); if (i < 0) return a;
    const k = p.slice(0, i).trim(); const v = p.slice(i + 1).trim();
    a[k] = decodeURIComponent(v); return a;
  }, {});
}
function getUserId(req) {
  if (req?.user?.id || req?.user?.sub) return String(req.user.id || req.user.sub);
  const ck = parseCookies(req);
  const tok = ck.access || ck.at;
  if (!tok) return null;
  try { const p = jwt.verify(tok, process.env.API_JWT_SECRET); return String(p.sub || p.userId || p.id); }
  catch { return null; }
}

/* ========== Crypto (tolère clair) ========== */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY doit faire 64 hex chars");
  return Buffer.from(hex, "hex");
}
function decMaybe(blob) {
  const s = String(blob || "");
  if (!s.startsWith("v1:")) return s;
  const [v, ivb64, tagb64, ctb64] = s.split(":");
  try {
    const iv = Buffer.from(ivb64, "base64");
    const tag = Buffer.from(tagb64, "base64");
    const ct = Buffer.from(ctb64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
    return pt.toString("utf8");
  } catch { return s; }
}

/* ========== DB cache (métadonnées) ========== */
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

/* ========== Xtream helpers ========== */
async function getCreds(userId) {
  const q = `
    SELECT base_url, username_enc, password_enc FROM xtream_accounts WHERE user_id=$1
    UNION ALL
    SELECT base_url, username_enc, password_enc FROM user_xtream WHERE user_id=$1
    LIMIT 1
  `;
  const { rows } = await pool.query(q, [userId]);
  const row = rows[0];
  if (!row) return null;
  const baseUrl = normalizeBaseUrl(row.base_url);
  const username = decMaybe(row.username_enc);
  const password = decMaybe(row.password_enc);
  if (!username || !password) return null;
  return { baseUrl, username, password };
}
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  s = s
    .replace(/\/player_api\.php.*$/i, "")
    .replace(/\/portal\.php.*$/i, "")
    .replace(/\/stalker_portal.*$/i, "")
    .replace(/\/(?:series|movie|live)\/.*$/i, "");
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
async function fetchWithTimeout(url, ms = 12000, headers = {}, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers, redirect: "follow", ...init }); }
  finally { clearTimeout(t); }
}
async function fetchJson(url) {
  const r = await fetchWithTimeout(url, 12000, { "User-Agent": "NovaStream/1.0" });
  const txt = await r.text();
  if (!r.ok) { const e = new Error(`HTTP_${r.status}`); e.status = r.status; e.body = txt; throw e; }
  try { return JSON.parse(txt); } catch { const e = new Error("BAD_JSON"); e.body = txt; throw e; }
}

/* ========== TMDB minimal ========== */
const TMDB_BASE = "https://api.themoviedb.org/3";
async function tmdbDetails(kind, id) {
  const u = new URL(`${TMDB_BASE}/${kind === "movie" ? "movie" : "tv"}/${id}`);
  u.searchParams.set("api_key", TMDB_KEY);
  u.searchParams.set("language", "fr-FR");
  return fetchJson(u.toString());
}

/* ========== Resolvers (light) ========== */
async function resolveMovie(reqUser, vodId, { refresh = false } = {}) {
  if (!refresh) {
    const cached = await getCache("movie", vodId);
    if (cached && cached.data) return cached.data;
  }
  const creds = await getCreds(reqUser);
  if (!creds) throw Object.assign(new Error("No Xtream creds"), { status: 404 });

  const info = await fetchJson(
    buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_info", { vod_id: vodId })
  );

  const tmdbId = Number(info?.info?.tmdb_id || info?.movie_data?.tmdb_id || 0) || null;
  if (!tmdbId) {
    const title = String(info?.info?.name || info?.movie_data?.name || "").trim() || null;
    const payload = { kind: "movie", xtream_id: String(vodId), title, overview: null, data: { info } };
    await putCache("movie", vodId, null, title, payload);
    return payload;
  }

  const det = await tmdbDetails("movie", tmdbId);
  const payload = {
    kind: "movie",
    xtream_id: String(vodId),
    tmdb_id: det.id,
    title: det.title || det.original_title || null,
    poster_url: det.poster_path ? `https://image.tmdb.org/t/p/w500${det.poster_path}` : null,
    backdrop_url: det.backdrop_path ? `https://image.tmdb.org/t/p/w1280${det.backdrop_path}` : null,
    overview: det.overview || null,
    data: det,
  };
  await putCache("movie", vodId, tmdbId, payload.title, payload);
  return payload;
}

/* ========== Upstream policy (strict|public|off) ========== */
function isPrivateIPv4(ip) {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some(n => Number.isNaN(n))) return false;
  const [a, b] = o;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 0) return true;
  if (a >= 224) return true;
  return false;
}
function isPrivateIPv6(ip) {
  const s = ip.toLowerCase();
  return s === "::1" || s.startsWith("fc") || s.startsWith("fd") || s.startsWith("fe80") || s.startsWith("ff");
}
async function assertAllowedUpstream(targetUrl, baseUrl) {
  const mode = (process.env.SECURE_PROXY_MODE || "public").toLowerCase();
  const u = new URL(targetUrl);
  if (!/^https?:$/.test(u.protocol)) throw Object.assign(new Error("bad-scheme"), { status: 400 });
  if (u.username || u.password) throw Object.assign(new Error("bad-auth"), { status: 400 });
  if (mode === "off") return;
  if (mode === "strict") {
    const b = new URL(baseUrl);
    const bPort = Number(b.port || (b.protocol === "https:" ? 443 : 80));
    const uPort = Number(u.port || (u.protocol === "https:" ? 443 : 80));
    if (b.hostname !== u.hostname || bPort !== uPort || b.protocol !== u.protocol) {
      const e = new Error("forbidden host"); e.status = 400; throw e;
    }
    return;
  }
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length) { const e = new Error("dns-failed"); e.status = 400; throw e; }
  for (const a of addrs) {
    if (a.family === 4 && isPrivateIPv4(a.address)) { const e = new Error("private-ipv4"); e.status = 400; throw e; }
    if (a.family === 6 && isPrivateIPv6(a.address)) { const e = new Error("private-ipv6"); e.status = 400; throw e; }
  }
}

/* ========== Routes ========== */

// Pas d’URL directe
router.get("/:kind(movie|series|live)/:id/stream-url", (_req, res) =>
  res.status(410).json({ error: "direct-url-disabled" })
);

// HLS: live réécrit, VOD redirigé vers /file
router.get("/:kind(movie|series|live)/:id/hls.m3u8", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const { kind, id } = req.params;
    if (kind !== "live") return res.redirect(302, `/api/media/${kind}/${id}/file`);

    const creds = await getCreds(userId);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const candidates = (base) => {
      const root = base.replace(/\/$/,"");
      return [
        `${root}/live/${creds.username}/${creds.password}/${id}.m3u8`,
        `${root}/live/${creds.username}/${creds.password}/${id}.ts`,
        `${root}/live/${creds.username}/${creds.password}/${id}`
      ];
    };

    const bases = (() => {
      const u = new URL(creds.baseUrl);
      const alt = new URL(creds.baseUrl);
      if (u.protocol === "https:") { alt.protocol = "http:"; return [u.toString(), alt.toString()]; }
      alt.protocol = "https:"; return [u.toString(), alt.toString()];
    })();

    let m3u8Url = null;
    for (const b of bases) {
      for (const u of candidates(b)) {
        try {
          let r = await fetchWithTimeout(u, 6000, { "User-Agent": "VLC/3.0" }, { method: "HEAD" });
          if (!r.ok) r = await fetchWithTimeout(u, 7000, { "User-Agent": "VLC/3.0", Range: "bytes=0-1023" }, { method: "GET" });
          if (r.ok) { m3u8Url = u; break; }
        } catch {}
      }
      if (m3u8Url) break;
    }
    if (!m3u8Url) return res.redirect(302, `/api/media/live/${id}/file`);

    const up = await fetchWithTimeout(m3u8Url, 12000, { "User-Agent": "VLC/3.0" });
    if (!up.ok) return res.redirect(302, `/api/media/live/${id}/file`);

    const origin = new URL(m3u8Url);
    const text = await up.text();
    const rewrite = (line) => {
      if (line.startsWith("#EXT-X-KEY")) {
        return line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const abs = new URL(uri, origin).toString();
          return `URI="/api/media/proxy/u/${b64u(abs)}"`;
        });
      }
      if (!line || line.startsWith("#")) return line;
      const abs = new URL(line, origin).toString();
      return `/api/media/proxy/u/${b64u(abs)}`;
    };
    const body = text.split(/\r?\n/).map(rewrite).join("\n");
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  } catch (e) { next(e); }
});

// Proxy via base64url dans le chemin
router.get("/proxy/u/:b64", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const creds = await getCreds(userId);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const url = fromB64u(req.params.b64 || "");
    if (!/^https?:\/\//i.test(url)) { const e = new Error("missing url"); e.status = 400; throw e; }
    await assertAllowedUpstream(url, creds.baseUrl);

    const headers = { "User-Agent": "VLC/3.0", "Referer": creds.baseUrl + "/" };
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];

    const up = await fetchWithTimeout(url, 15000, headers);
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
    if (up.body) Readable.fromWeb(up.body).pipe(res); else res.end();
  } catch (e) { next(e); }
});

// Ancienne route query (compat)
router.get("/proxy", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const creds = await getCreds(userId);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const url = (req.query.url || "").toString();
    if (!/^https?:\/\//i.test(url)) { const e = new Error("missing url"); e.status = 400; throw e; }
    await assertAllowedUpstream(url, creds.baseUrl);

    const headers = { "User-Agent": "VLC/3.0", "Referer": creds.baseUrl + "/" };
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];

    const up = await fetchWithTimeout(url, 15000, headers);
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
    if (up.body) Readable.fromWeb(up.body).pipe(res); else res.end();
  } catch (e) { next(e); }
});

/* ======== Transcode audio→AAC pour VOD MKV ======== */
router.get("/:kind(movie|series)/:id/transcode.mp4", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const creds = await getCreds(userId);
    if (!creds) return res.status(404).json({ error: "no-xtream" });

    const srcParam = req.query.u || req.query.src || "";
    const src = String(srcParam).includes(".") ? fromB64u(String(srcParam)) : String(srcParam);
    if (!/^https?:\/\//i.test(src)) return res.status(400).json({ error: "missing src" });

    await assertAllowedUpstream(src, creds.baseUrl);

    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");

    const args = [
      "-loglevel","error",
      "-nostdin",
      "-reconnect","1","-reconnect_streamed","1","-reconnect_at_eof","1",
      "-i", src,
      "-map","0:v:0","-c:v","copy",
      "-map","0:a:0?","-c:a","aac","-b:a","160k","-ac","2",
      "-movflags","+frag_keyframe+empty_moov",
      "-f","mp4","pipe:1"
    ];
    const ff = spawn("ffmpeg", args, { stdio: ["ignore","pipe","inherit"] });

    ff.on("error", () => { if (!res.headersSent) res.status(500).end(); });
    ff.stdout.pipe(res);
    const kill = () => { try { ff.kill("SIGKILL"); } catch {} };
    req.on("close", kill);
    ff.on("close", (code) => { if (code !== 0 && !res.headersSent) res.status(502).end(); });
  } catch (e) { next(e); }
});

// Fallback fichiers (VOD/Live)
router.get("/:kind(movie|series|live)/:id/file", async (req, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.sendStatus(401);

    const { kind, id } = req.params;
    const debug = req.query.debug === "1";
    const notes = [];
    const tried = [];

    const creds0 = await getCreds(userId);
    if (!creds0) return res.status(404).json({ error: "no-xtream" });

    const bases = (() => {
      const u = new URL(creds0.baseUrl);
      const alt = new URL(creds0.baseUrl);
      if (u.protocol === "https:") { alt.protocol = "http:"; return [u.toString().replace(/\/$/,""), alt.toString().replace(/\/$/,"")]; }
      alt.protocol = "https:"; return [u.toString().replace(/\/$/,""), alt.toString().replace(/\/$/,"")];
    })();

    const username = creds0.username;
    const password = creds0.password;

    const tryUrls = async (urls) => {
      for (const u of urls) {
        tried.push(u);
        try {
          let r = await fetchWithTimeout(u, 7000, { "User-Agent": "VLC/3.0" }, { method: "HEAD" });
          if (r.ok) return u;
          r = await fetchWithTimeout(u, 7000, { "User-Agent": "VLC/3.0", Range: "bytes=0-1023" }, { method: "GET" });
          if (r.ok) return u;
          r = await fetchWithTimeout(u, 7000, { "User-Agent": "VLC/3.0" }, { method: "GET" });
          if (r.ok) return u;
        } catch {}
      }
      return null;
    };

    const buildCandidates = (base, k, sid, exts) => {
      const root = base.replace(/\/$/,"");
      const seg = k === "movie" ? "movie" : k === "series" ? "series" : "live";
      const list = [];
      for (const ext of exts) list.push(`${root}/${seg}/${username}/${password}/${sid}${ext}`);
      list.push(`${root}/${seg}/${username}/${password}/${sid}`);
      return list;
    };

    let fileUrl = null;

    if (kind === "live") {
      const extOrder = [".m3u8", ".ts"];
      for (const b of bases) {
        const hit = await tryUrls(buildCandidates(b, "live", id, extOrder));
        if (hit) { fileUrl = hit; break; }
      }
    } else {
      let containerExt = null;
      let streamId = id;

      if (kind === "movie") {
        try {
          const info = await fetchJson(buildPlayerApi(bases[0], username, password, "get_vod_info", { vod_id: id }));
          const sid = Number(info?.movie_data?.stream_id || info?.info?.stream_id || 0);
          if (sid) { streamId = String(sid); notes.push(`resolved stream_id=${streamId}`); }
          const ext = String(info?.movie_data?.container_extension || info?.info?.container_extension || "").trim();
          if (ext) { containerExt = "." + ext.replace(/^\.+/, ""); notes.push(`container_extension=${containerExt}`); }
        } catch (e) { notes.push(`get_vod_info error: ${e.message || e}`); }
      }

      const extOrder = [];
      if (containerExt) extOrder.push(containerExt.toLowerCase());
      for (const e of [".mp4", ".mkv", ".ts", ".m3u8"]) if (!extOrder.includes(e)) extOrder.push(e);

      for (const b of bases) {
        const hit = await tryUrls(buildCandidates(b, kind, streamId, extOrder));
        if (hit) { fileUrl = hit; break; }
      }

      // Si MKV (souvent AC3/DTS), redirige vers transcodage audio→AAC
      if (fileUrl && (/\.mkv(\?|$)/i.test(fileUrl) || (containerExt && containerExt.toLowerCase() === ".mkv"))) {
        const u = `/api/media/${kind}/${id}/transcode.mp4?u=${encodeURIComponent(b64u(fileUrl))}`;
        return res.redirect(302, u);
      }
    }

    if (!fileUrl) {
      if (debug) return res.status(404).json({ error: "no-file", tried, notes });
      return res.status(404).json({ error: "no-file" });
    }

    try { await assertAllowedUpstream(fileUrl, creds0.baseUrl); } catch (e) { if (debug) notes.push(String(e)); }

    req.url = `/proxy/u/${b64u(fileUrl)}`;
    return router.handle(req, res, next);
  } catch (e) { next(e); }
});

/* ========== Metadata (min) ========== */
router.get("/movie/:id", async (req, res, next) => {
  try { res.json(await resolveMovie(getUserId(req), req.params.id, { refresh: req.query.refresh === "1" })); }
  catch (e) { e.status = e.status || 500; next(e); }
});

export default router;
