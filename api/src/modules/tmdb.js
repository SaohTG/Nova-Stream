// api/src/modules/tmdb.js
import express from "express";

const router = express.Router();

/**
 * GET /tmdb/trending?media_type=all|movie|tv&time_window=week|day&limit=15
 * -> Ne renvoie PAS d'images TMDB. Uniquement titres/overview/notes.
 */
router.get("/tmdb/trending", async (req, res) => {
  try {
    const media_type = ["all", "movie", "tv"].includes(req.query.media_type)
      ? req.query.media_type
      : "all";
    const time_window = req.query.time_window === "week" ? "week" : "day";
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));

    const key = process.env.TMDB_API_KEY;
    if (!key) return res.status(500).json({ ok: false, error: "TMDB_API_KEY manquant" });

    const url = `https://api.themoviedb.org/3/trending/${media_type}/${time_window}?api_key=${key}&language=fr-FR`;
    const r = await fetch(url, { headers: { Accept: "application/json" } });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      return res.status(r.status).json({ ok: false, error: txt || `HTTP ${r.status}` });
    }
    const j = await r.json();
    const results = (j?.results || []).slice(0, limit).map((x) => ({
      id: x.id,
      media_type: x.media_type || media_type,
      title: x.title || x.name || "",
      overview: x.overview || "",
      vote_average: x.vote_average ?? null,
      release_date: x.release_date || x.first_air_date || null,
    }));
    res.json(results);
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || "Erreur TMDB" });
  }
});

export default router;
