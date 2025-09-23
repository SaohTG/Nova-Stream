// api/src/routes/media.ts
import express from "express";
import axios from "axios";
const r = express.Router();

// retourne l’URL directe si dispo
r.get("/:kind(movie|series|live)/:id/stream-url", async (req, res) => {
  const { kind, id } = req.params;
  const { host, port, username, password, https } = await loadXtreamCreds(req.user.id); // depuis DB
  const base = `${https ? "https" : "http"}://${host}:${port}`;
  const candidates =
    kind === "live"
      ? [`${base}/live/${username}/${password}/${id}.m3u8`, `${base}/live/${username}/${password}/${id}.ts`]
      : [`${base}/${kind}/${username}/${password}/${id}.m3u8`, `${base}/${kind}/${username}/${password}/${id}.mp4`];

  for (const url of candidates) {
    try {
      const head = await axios.head(url, { timeout: 4000, validateStatus: s => s < 500 });
      if (head.status < 400) return res.json({ url });
    } catch {}
  }
  return res.status(404).json({ error: "no-src" });
});

// proxy streaming pour éviter CORS
r.get("/:kind(movie|series|live)/:id/stream", async (req, res) => {
  const { kind, id } = req.params;
  const { host, port, username, password, https } = await loadXtreamCreds(req.user.id);
  const base = `${https ? "https" : "http"}://${host}:${port}`;
  const tryUrls =
    kind === "live"
      ? [`${base}/live/${username}/${password}/${id}.m3u8`, `${base}/live/${username}/${password}/${id}.ts`]
      : [`${base}/${kind}/${username}/${password}/${id}.m3u8`, `${base}/${kind}/${username}/${password}/${id}.mp4`];

  for (const url of tryUrls) {
    try {
      const upstream = await axios.get(url, { responseType: "stream", timeout: 8000 });
      // Propager les en-têtes utiles au player
      if (url.endsWith(".m3u8")) res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      if (url.endsWith(".mp4")) res.setHeader("Content-Type", "video/mp4");
      if (url.endsWith(".ts")) res.setHeader("Content-Type", "video/MP2T");
      res.setHeader("Accept-Ranges", "bytes");
      return upstream.data.pipe(res);
    } catch {}
  }
  return res.status(502).json({ error: "upstream-failed" });
});

export default r;
