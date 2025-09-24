// api/src/modules/stream.js
import { Router } from "express";
import { Pool } from "pg";
import { spawn } from "child_process";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const APP_ORIGIN = process.env.APP_ORIGIN || "*"; // ex: https://app.lorna.tv

/* ---- Helpers ----------------------------------------------------------- */

function normBase(u) {
  const url = new URL(u);
  if (!/^https?:$/.test(url.protocol)) throw new Error("invalid_scheme");
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

async function getAccount(userId, accountId) {
  // Adapte ces colonnes si ton schéma diffère
  const { rows } = await pool.query(
    `SELECT id, user_id, base_url, username, password
     FROM xtream_accounts
     WHERE id=$1 AND user_id=$2
     LIMIT 1`,
    [accountId, userId]
  );
  if (!rows[0]) throw Object.assign(new Error("xtream_account_not_found"), { status: 404 });
  const base = normBase(rows[0].base_url);
  return { base, user: rows[0].username, pass: rows[0].password };
}

async function resolveVodExt(base, user, pass, id) {
  const u = `${base}/player_api.php?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&action=get_vod_info&vod_id=${encodeURIComponent(id)}`;
  const r = await fetch(u);
  if (!r.ok) return "mp4";
  const j = await r.json().catch(() => null);
  return j?.info?.container_extension || "mp4";
}

function upstreamVodURL(base, user, pass, id, ext) {
  return `${base}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.${ext}`;
}

function upstreamHlsM3U8(base, type, user, pass, id) {
  // type: live (éventuellement: movie/series si un jour HLS côté VOD)
  return `${base}/${type}/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.m3u8`;
}

/* ---- Routes VOD -------------------------------------------------------- */

// GET /api/stream/vod/:accId/:vodId  → passthrough MP4 si possible
router.get("/vod/:accId/:vodId", async (req, res) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { accId, vodId } = req.params;
    const acc = await getAccount(uid, accId);

    const ext = (req.query.ext && String(req.query.ext)) || await resolveVodExt(acc.base, acc.user, acc.pass, vodId);
    const upstream = upstreamVodURL(acc.base, acc.user, acc.pass, vodId, ext);
    const hdrs = req.headers.range ? { Range: req.headers.range } : {};
    const up = await fetch(upstream, { headers: hdrs, redirect: "follow" });

    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    for (const [k, v] of up.headers) res.setHeader(k, v);
    res.status(up.status);
    if (up.body) up.body.pipe(res); else res.end();
  } catch (e) {
    const s = e.status || 502;
    if (process.env.NODE_ENV !== "production") console.error("[vod passthrough]", e);
    res.status(s).json({ error: "vod_upstream_error" });
  }
});

// GET /api/stream/vodmp4/:accId/:vodId  → remux MKV→MP4 en temps réel
router.get("/vodmp4/:accId/:vodId", async (req, res) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { accId, vodId } = req.params;
    const acc = await getAccount(uid, accId);

    const ext = (req.query.ext && String(req.query.ext)) || await resolveVodExt(acc.base, acc.user, acc.pass, vodId);
    const upstream = upstreamVodURL(acc.base, acc.user, acc.pass, vodId, ext);

    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    res.setHeader("Content-Type", "video/mp4");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Accept-Ranges", "none");

    const args = [
      "-hide_banner", "-loglevel", "error",
      "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_on_network_error", "1",
      "-i", upstream,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "copy",
      "-c:a", "aac", "-b:a", "128k",
      "-movflags", "+frag_keyframe+empty_moov",
      "-f", "mp4",
      "pipe:1",
    ];
    const ff = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });

    const endAll = (code) => { try { ff.kill("SIGKILL"); } catch {} if (!res.writableEnded) res.end(); };
    ff.stderr.on("data", d => process.stderr.write(d));
    ff.stdout.on("data", chunk => { if (!res.write(chunk)) ff.stdout.pause(); });
    res.on("drain", () => ff.stdout.resume());
    ff.on("close", () => endAll());
    ff.on("error", () => endAll());
    req.on("close", () => endAll());
  } catch (e) {
    const s = e.status || 502;
    if (process.env.NODE_ENV !== "production") console.error("[vod remux]", e);
    res.status(s).json({ error: "vod_remux_error" });
  }
});

/* ---- Routes HLS (live) ------------------------------------------------- */

// GET /api/stream/hls/:accId/live/:id.m3u8 → réécrit les segments vers /seg/...
router.get("/hls/:accId/:type/:id.m3u8", async (req, res) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { accId, type, id } = req.params;
    const acc = await getAccount(uid, accId);

    const upstream = upstreamHlsM3U8(acc.base, type, acc.user, acc.pass, id);
    const up = await fetch(upstream, { redirect: "follow" });
    if (!up.ok) return res.sendStatus(up.status);

    let text = await up.text();
    // réécrit “xxx.ts” et “subpaths/xxx.ts”
    text = text.replace(/([^\s#]+\.ts)/g, (m) =>
      `/api/stream/seg/${encodeURIComponent(accId)}/${encodeURIComponent(type)}/${encodeURIComponent(m)}`
    );

    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-store");
    res.send(text);
  } catch (e) {
    const s = e.status || 502;
    if (process.env.NODE_ENV !== "production") console.error("[hls m3u8]", e);
    res.status(s).json({ error: "hls_playlist_error" });
  }
});

// GET /api/stream/seg/:accId/:type/:segPath...  → proxy segments avec Range
router.get("/seg/:accId/:type/*", async (req, res) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { accId, type } = req.params;
    const segRel = req.params[0]; // “path/to/file.ts”
    const acc = await getAccount(uid, accId);

    const upstream = `${acc.base}/${type}/${encodeURIComponent(acc.user)}/${encodeURIComponent(acc.pass)}/${segRel}`;
    const hdrs = req.headers.range ? { Range: req.headers.range } : {};
    const up = await fetch(upstream, { headers: hdrs, redirect: "follow" });

    res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
    for (const [k, v] of up.headers) res.setHeader(k, v);
    res.status(up.status);
    if (up.body) up.body.pipe(res); else res.end();
  } catch (e) {
    const s = e.status || 502;
    if (process.env.NODE_ENV !== "production") console.error("[hls seg]", e);
    res.status(s).json({ error: "hls_segment_error" });
  }
});

export default router;
