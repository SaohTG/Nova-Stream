// api/src/modules/media-series-episodes.js
import express from "express";
import axios from "axios";

const router = express.Router();

// ---- CONFIG EXEMPLE (optionnel) ----
// Utilise des vars d'env si tu tires depuis Xtream Codes.
// process.env.XTREAM_URL, XTREAM_USER, XTREAM_PASS
async function fetchSeriesM3U(seriesId) {
  // TODO: Implémente selon ta source réelle.
  // EXEMPLE Xtream (à adapter):
  // const { data } = await axios.get(`${process.env.XTREAM_URL}/player_api.php`, {
  //   params: { username: process.env.XTREAM_USER, password: process.env.XTREAM_PASS, action: "get_series_info", series_id: seriesId }
  // });
  // Construis un texte M3U "#EXTINF\nURL\n" à partir des épisodes retournés.
  throw new Error("fetchSeriesM3U(seriesId) non implémenté");
}

function parseEpisodesFromM3U(text) {
  const lines = String(text).split(/\r?\n/).filter(Boolean);
  const bySeason = {};
  const flat = [];

  let curSeason = 1;
  let curEpisode = 0;

  for (let i = 0; i < lines.length - 1; i += 2) {
    const meta = lines[i];
    const url  = lines[i + 1];
    const title = meta.replace(/^#EXTINF:[^,]*,?/, "").trim();

    let s = null, e = null;
    let m = /S\s*(\d+)\s*E\s*(\d+)/i.exec(title) || /Season\s*(\d+)[^\d]+Episode\s*(\d+)/i.exec(title);
    if (m) { s = +m[1]; e = +m[2]; }
    if (s == null) {
      m = /S\s*(\d+)/i.exec(title);
      if (m) s = +m[1];
    }
    if (s == null) s = curSeason;
    if (e == null) {
      if (s !== curSeason) { curSeason = s; curEpisode = 0; }
      e = ++curEpisode;
    } else {
      if (s !== curSeason) { curSeason = s; curEpisode = 0; }
      curEpisode = e;
    }

    const fileId = (new URL(url).pathname.split("/").pop() || "").replace(/\.(mkv|mp4)$/i, "");
    bySeason[s] ??= {};
    bySeason[s][e] = { title, url, fileId, s, e, index: flat.length };
    flat.push({ title, url, fileId, s, e, index: flat.length });
  }
  return { bySeason, flat };
}

// Liste normalisée
router.get("/media/series/:seriesId/episodes", async (req, res) => {
  try {
    const text = await fetchSeriesM3U(req.params.seriesId);
    const map = parseEpisodesFromM3U(text);
    res.json(map);
  } catch {
    res.status(500).json({ error: "episodes_unavailable" });
  }
});

// Résolution par S/E → fichier
router.get("/media/series/:seriesId/episode/:s/:e/file", async (req, res) => {
  try {
    const text = await fetchSeriesM3U(req.params.seriesId);
    const { bySeason } = parseEpisodesFromM3U(text);
    const ep = bySeason?.[+req.params.s]?.[+req.params.e];
    if (!ep) return res.status(404).json({ error: "episode_not_found" });
    return res.redirect(302, ep.url);
  } catch {
    res.status(500).json({ error: "resolve_failed" });
  }
});

// Fallback par index d’apparition
router.get("/media/series/:seriesId/episode/by-index/:i/file", async (req, res) => {
  try {
    const text = await fetchSeriesM3U(req.params.seriesId);
    const { flat } = parseEpisodesFromM3U(text);
    const ep = flat?.[+req.params.i];
    if (!ep) return res.status(404).json({ error: "episode_not_found" });
    return res.redirect(302, ep.url);
  } catch {
    res.status(500).json({ error: "resolve_failed" });
  }
});

// Option HLS: rewrite .mkv → /hls.m3u8
router.get("/media/series/:seriesId/episode/:s/:e/hls.m3u8", async (req, res) => {
  try {
    const text = await fetchSeriesM3U(req.params.seriesId);
    const { bySeason } = parseEpisodesFromM3U(text);
    const ep = bySeason?.[+req.params.s]?.[+req.params.e];
    if (!ep) return res.status(404).json({ error: "episode_not_found" });
    const hls = ep.url.replace(/\/[^/]+\.mkv(\?.*)?$/i, "/hls.m3u8$1");
    return res.redirect(302, hls);
  } catch {
    res.status(500).json({ error: "resolve_failed" });
  }
});

export default router;
