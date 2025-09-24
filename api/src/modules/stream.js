// api/src/modules/stream.js
import { Router } from "express";
import { spawn } from "child_process";
import fetch from "node-fetch";

const router = Router();
const XTREAM = process.env.XTREAM_HOST;           // ex: https://noos.vip
const APP_ORIGIN = process.env.APP_ORIGIN || "*";  // ex: https://app.lorna.tv

// ---- Pass-through VOD (si déjà MP4 lisible)
router.get("/vod/:user/:pass/:id", async (req, res) => {
  try {
    const { user, pass, id } = req.params;
    const ext = String(req.query.ext || "mp4");
    const upstream = `${XTREAM}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.${ext}`;
    const hdrs = req.headers.range ? { Range: req.headers.range } : {};
    const up = await fetch(upstream, { headers: hdrs, redirect: "follow" });

    res.set("Access-Control-Allow-Origin", APP_ORIGIN);
    for (const [k, v] of up.headers) res.set(k, v);
    res.status(up.status);
    if (up.body) up.body.pipe(res); else res.end();
  } catch (e) {
    console.error("[vod passthrough]", e);
    res.status(502).json({ error: "upstream_error" });
  }
});

// ---- Remux MKV → fragmented MP4 (lecture immédiate, seek limité)
router.get("/vodmp4/:user/:pass/:id", async (req, res) => {
  const { user, pass, id } = req.params;
  const ext = String(req.query.ext || "mkv"); // on suppose MKV si inconnu
  const upstream = `${XTREAM}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}.${ext}`;

  // Headers réponse
  res.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Cache-Control", "no-store");
  // pas de Range en remux temps réel
  res.setHeader("Accept-Ranges", "none");

  // ffmpeg: copie la vidéo si possible, convertit l'audio en AAC, fragmente MP4
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

  let ended = false;
  const endAll = (code) => {
    if (ended) return;
    ended = true;
    try { ff.kill("SIGKILL"); } catch {}
    if (!res.headersSent) res.status(code || 500);
    if (!res.writableEnded) res.end();
  };

  ff.stderr.on("data", (d) => process.stderr.write(Buffer.from(d)));

  ff.stdout.on("data", (chunk) => { if (!res.write(chunk)) ff.stdout.pause(); });
  res.on("drain", () => ff.stdout.resume());

  ff.on("close", (code) => endAll(code === 0 ? 200 : 502));
  ff.on("error", () => endAll(502));
  req.on("close", () => endAll(499));
});

export default router;
