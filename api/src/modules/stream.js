// api/src/modules/stream.js
// Proxy streaming Xtream sécurisé (multi-fournisseurs), sans exposer server/user/pass au front.
// - VOD passthrough:        GET /api/stream/vod/:vodId
// - VOD remux MP4 (MKV ok): GET /api/stream/vodmp4/:vodId
// - HLS playlist rewrite:   GET /api/stream/hls/:type/:id.m3u8   (type = live|movie|series)
// - HLS segments proxy:     GET /api/stream/seg?u=<absolute-segment-url>

import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";
import { spawn } from "child_process";
import { Readable } from "node:stream";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG]", e));

const APP_ORIGIN = process.env.APP_ORIGIN || "*";
const ALLOW_PROXY_HOSTS = (process.env.ALLOW_PROXY_HOSTS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

/* -------------------- Crypto -------------------- */
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

/* -------------------- Creds Xtream -------------------- */
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
  if (!row) throw Object.assign(new Error("xtream_account_not_found"), { status: 404 });
  return {
    base: normalizeBaseUrl(row.base_url),
    user: dec(row.username_enc),
    pass: dec(row.password_enc),
  };
}

/* -------------------- URL helpers -------------------- */
const vodURL = (base, user, pass, id, ext) =>
  `${base}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.${ext}`;
const hlsURL = (base, type, user, pass, id) =>
  `${base}/${type}/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.m3u8`;

async function resolveVodExt(base, user, pass, id) {
  try {
    const u = new URL(`${base}/player_api.php`);
    u.searchParams.set("username", user);
    u.searchParams.set("password", pass);
    u.searchParams.set("action", "get_vod_info");
    u.searchParams.set("vod_id", String(id));
    const r = await fetch(u.toString(), { redirect: "follow" });
    const j = await r.json().catch(() => null);
    return (j?.info?.container_extension || j?.movie_data?.container_extension || "mp4").toLowerCase();
  } catch { return "mp4"; }
}

function assertAllowedHost(absUrl, base) {
  const want = new URL(base);
  const got = new URL(absUrl);
  const wantHost = `${want.protocol}//${want.hostname}:${want.port || (want.protocol === "https:" ? 443 : 80)}`.toLowerCase();
  const gotHost  = `${got.protocol}//${got.hostname}:${got.port  || (got.protocol === "https:" ? 443 : 80)}`.toLowerCase();
  const allowSet = new Set([wantHost, ...ALLOW_PROXY_HOSTS.map(h => h.includes("://") ? h : `${want.protocol}//${h}`)]);
  if (!allowSet.has(gotHost)) {
    const e = new Error("forbidden_host"); e.status = 400; throw e;
  }
}

/* -------------------- Core handlers -------------------- */
async function handleVod(req, res, remuxMp4) {
  const uid = req.user?.sub;
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const vodId = req.params.vodId;

  try {
    const { base, user, pass } = await getCreds(uid);
    const ext = await resolveVodExt(base, user, pass, vodId);
    const upstream = vodURL(base, user, pass, vodId, ext);

    if (!remuxMp4) {
      const hdrs = {};
      if (req.headers.range) hdrs.Range = req.headers.range;
      if (req.headers["if-range"]) hdrs["If-Range"] = req.headers["if-range"];
      const up = await fetch(upstream, { headers: hdrs, redirect: "follow" });

      res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
      for (const [k, v] of up.headers) res.setHeader(k, v);
      res.status(up.status);
      if (up.body) Readable.fromWeb(up.body).pipe(res); else res.end();
      return;
    }

    // Remux MP4 fragmenté pour MKV/TS
    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Accept-Ranges", "none");

    const args = [
      "-hide_banner","-loglevel","error",
      "-reconnect","1","-reconnect_streamed","1","-reconnect_on_network_error","1",
      "-i", upstream,
      "-map","0:v:0","-map","0:a:0?",
      "-c:v","copy",
      "-c:a","aac","-b:a","128k",
      "-movflags","+frag_keyframe+empty_moov",
      "-f","mp4","pipe:1",
    ];
    const ff = spawn("ffmpeg", args, { stdio: ["ignore","pipe","pipe"] });
    ff.stderr.on("data", d => process.stderr.write(d));
    ff.stdout.on("data", chunk => { if (!res.write(chunk)) ff.stdout.pause(); });
    res.on("drain", () => ff.stdout.resume());
    const endAll = () => { try { ff.kill("SIGKILL"); } catch {} if (!res.writableEnded) res.end(); };
    ff.on("close", endAll); ff.on("error", endAll); req.on("close", endAll);
  } catch (e) {
    const status = e.status || 502;
    res.status(status).json({ error: remuxMp4 ? "vod_remux_error" : "vod_upstream_error" });
  }
}

async function handleHlsPlaylist(req, res) {
  const uid = req.user?.sub;
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const { type, id } = req.params; // live|movie|series

  try {
    const { base, user, pass } = await getCreds(uid);
    const src = hlsURL(base, type, user, pass, id);
    const up = await fetch(src, { redirect: "follow" });
    if (!up.ok) return res.sendStatus(up.status);

    const origin = new URL(src);
    let text = await up.text();

    const rewrite = (line) => {
      if (line.startsWith("#EXT-X-KEY")) {
        return line.replace(/URI="([^"]+)"/, (_m, uri) => {
          const abs = new URL(uri, origin).toString();
          try { assertAllowedHost(abs, base); } catch {}
          return `URI="/api/stream/seg?u=${encodeURIComponent(abs)}"`;
        });
      }
      if (!line || line.startsWith("#")) return line;
      const abs = new URL(line, origin).toString();
      try { assertAllowedHost(abs, base); } catch {}
      return `/api/stream/seg?u=${encodeURIComponent(abs)}`;
    };

    const body = text.split(/\r?\n/).map(rewrite).join("\n");
    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(body);
  } catch (e) {
    res.status(e.status || 502).json({ error: "hls_playlist_error" });
  }
}

async function handleSegment(req, res) {
  const uid = req.user?.sub;
  if (!uid) return res.status(401).json({ error: "unauthorized" });
  const url = String(req.query.u || "");
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({ error: "bad_url" });

  try {
    const { base } = await getCreds(uid);
    assertAllowedHost(url, base);

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;
    if (req.headers["if-range"]) headers["If-Range"] = req.headers["if-range"];
    const up = await fetch(url, { headers, redirect: "follow" });

    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    for (const [k, v] of up.headers) res.setHeader(k, v);
    res.status(up.status);
    if (up.body) Readable.fromWeb(up.body).pipe(res); else res.end();
  } catch (e) {
    res.status(e.status || 502).json({ error: "hls_segment_error" });
  }
}

/* -------------------- Routes -------------------- */
router.get("/vod/:vodId", (req, res) => handleVod(req, res, false));
router.get("/vodmp4/:vodId", (req, res) => handleVod(req, res, true));
router.get("/hls/:type(live|movie|series)/:id.m3u8", (req, res) => handleHlsPlaylist(req, res));
router.get("/seg", (req, res) => handleSegment(req, res));

export default router;
