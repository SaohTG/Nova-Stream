// api/src/modules/tmdb.js
import { Router } from "express";

// Utilitaires simples
const norm = (s) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const getYear = (d) => {
  if (!d) return null;
  const y = String(d).slice(0, 4);
  return /^\d{4}$/.test(y) ? Number(y) : null;
};

// Fuzzy match très simple titre(+année)
function pickBestMatch(tmdbItem, vodList, type) {
  // type: "movie" | "tv"
  const title = norm(
    type === "movie"
      ? tmdbItem.title || tmdbItem.original_title
      : tmdbItem.name || tmdbItem.original_name
  );
  const year =
    type === "movie" ? getYear(tmdbItem.release_date) : getYear(tmdbItem.first_air_date);

  let best = null;
  let bestScore = -1;

  for (const it of vodList) {
    const xtitle = norm(it.name || it.title || it.stream_display_name);
    if (!xtitle) continue;

    let score = 0;
    if (xtitle === title) score += 3;
    else if (xtitle.includes(title) || title.includes(xtitle)) score += 2;

    // bonus si l’année colle (quand on peut la deviner dans le nom)
    if (year) {
      const hasYear = new RegExp(`(?:\\s|\\(|\\[|\\{|\\-|\\.)${year}(?:\\s|\\)|\\]|\\}|\\-|\\.|$)`);
      if (hasYear.test(it.name || "")) score += 1;
    }

    if (score > bestScore) {
      best = it;
      bestScore = score;
    }
  }

  // on garde seulement des correspondances correctes
  return bestScore >= 2 ? best : null;
}

const tmdb = Router();

/**
 * GET /tmdb/trending-week-mapped
 * - Auth requise (cookie JWT)
 * - Appelle TMDB trending/all/week
 * - Récupère la liste Xtream (films + séries) via nos endpoints internes
 * - Mappe chaque entrée TMDB -> affiche Xtream correspondante
 * - Renvoie max 15 éléments avec { image, title/name, stream_id/series_id, __rank }
 */
tmdb.get("/trending-week-mapped", async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY manquant" });

    // 1) TMDB trending week (FR ou EN, adapte si besoin)
    const tmdbUrl = `https://api.themoviedb.org/3/trending/all/week?api_key=${encodeURIComponent(
      apiKey
    )}&language=fr-FR`;
    const r = await fetch(tmdbUrl, { timeout: 15000 }).catch(() => null);
    if (!r || !r.ok) return res.status(502).json({ error: "TMDB indisponible" });
    const payload = await r.json().catch(() => ({}));
    const results = Array.isArray(payload?.results) ? payload.results : [];

    // 2) Récup listes Xtream via nos endpoints internes (en réutilisant le cookie JWT)
    const base = `http://localhost:${process.env.API_PORT || 4000}`;
    const headers = { cookie: req.headers.cookie || "", "content-type": "application/json" };

    // VOD (films)
    const vodRes = await fetch(`${base}/xtream/movies`, {
      method: "POST",
      headers,
      body: JSON.stringify({ limit: 5000 }),
    }).catch(() => null);
    const vodList = (vodRes && vodRes.ok ? await vodRes.json().catch(() => []) : []) || [];

    // Séries
    const serRes = await fetch(`${base}/xtream/series`, {
      method: "POST",
      headers,
      body: JSON.stringify({ limit: 5000 }),
    }).catch(() => null);
    const seriesList = (serRes && serRes.ok ? await serRes.json().catch(() => []) : []) || [];

    // 3) Mapping TMDB -> Xtream image
    const mapped = [];
    for (const item of results) {
      const mediaType = item.media_type === "tv" ? "tv" : "movie";
      const list = mediaType === "movie" ? vodList : seriesList;

      const match = pickBestMatch(item, list, mediaType);
      if (!match) continue;

      // image Xtream (UNIQUEMENT)
      const image =
        match.image ||
        match.cover ||
        match.stream_icon ||
        match.stream_logo ||
        match.movie_image ||
        null;
      if (!image) continue;

      mapped.push({
        // uniformise les champs utiles au front
        title: item.title || item.name || match.name || match.title || "Sans titre",
        image,
        media_type: mediaType,
        stream_id: match.stream_id || null,
        series_id: match.series_id || null,
      });

      if (mapped.length >= 15) break;
    }

    // 4) Ajoute __rank 1..15 pour l’overlay Netflix
    const ranked = mapped.map((it, i) => ({ ...it, __rank: i + 1 }));
    return res.json(ranked);
  } catch (e) {
    console.error("trending-week-mapped error:", e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default tmdb;
