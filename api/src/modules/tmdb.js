// api/src/modules/tmdb.js
import { Router } from "express";

const tmdb = Router();

/* ---------- Helpers ---------- */

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

const fetchJson = async (url, opts = {}, timeoutMs = 15000) => {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(id);
  }
};

function pickBestMatch(tmdbItem, xtreamList, mediaType) {
  // mediaType: "movie" | "tv"
  const title = norm(
    mediaType === "movie"
      ? tmdbItem.title || tmdbItem.original_title
      : tmdbItem.name || tmdbItem.original_name
  );
  const year =
    mediaType === "movie" ? getYear(tmdbItem.release_date) : getYear(tmdbItem.first_air_date);

  let best = null;
  let bestScore = -1;

  for (const it of xtreamList) {
    const xtitle = norm(it.name || it.title || it.stream_display_name);
    if (!xtitle) continue;

    let score = 0;
    if (xtitle === title) score += 3;
    else if (xtitle.includes(title) || title.includes(xtitle)) score += 2;

    if (year) {
      // Bonus si l'année est présente dans le nom Xtream
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

/* ---------- Route ---------- */

/**
 * GET /tmdb/trending-week-mapped
 * - Auth requise (JWT en cookie)
 * - Récupère TMDB trending/all/week (classement)
 * - Récupère les listes Xtream (films + séries) via nos endpoints internes /xtream/*
 * - Mappe chaque entrée TMDB vers une affiche Xtream (images Xtream uniquement)
 * - Renvoie max 15 éléments { title, image, media_type, stream_id/series_id, __rank }
 */
tmdb.get("/trending-week-mapped", async (req, res) => {
  try {
    const apiKey = process.env.TMDB_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "TMDB_API_KEY manquant" });

    // 1) TMDB – tendances semaine (FR)
    const tmdbUrl =
      `https://api.themoviedb.org/3/trending/all/week` +
      `?api_key=${encodeURIComponent(apiKey)}&language=fr-FR`;
    const tmdbData = await fetchJson(tmdbUrl);

    const results = Array.isArray(tmdbData?.results) ? tmdbData.results : [];
    if (results.length === 0) return res.json([]);

    // 2) Récup listes Xtream via nos endpoints internes, avec le cookie du client
    const base = `http://localhost:${process.env.API_PORT || 4000}`;
    const headers = {
      cookie: req.headers.cookie || "",
      "content-type": "application/json",
    };

    // On limite pour éviter les timeouts – ajuste si besoin
    const [moviesList, seriesList] = await Promise.all([
      fetchJson(`${base}/xtream/movies`, {
        method: "POST",
        headers,
        body: JSON.stringify({ limit: 2000 }),
      }).catch(() => []),
      fetchJson(`${base}/xtream/series`, {
        method: "POST",
        headers,
        body: JSON.stringify({ limit: 2000 }),
      }).catch(() => []),
    ]);

    const vod = Array.isArray(moviesList) ? moviesList : [];
    const tvs = Array.isArray(seriesList) ? seriesList : [];

    // 3) Mapping TMDB -> Xtream (images Xtream only)
    const mapped = [];
    for (const item of results) {
      const mediaType = item.media_type === "tv" ? "tv" : "movie";
      const list = mediaType === "movie" ? vod : tvs;

      const match = pickBestMatch(item, list, mediaType);
      if (!match) continue;

      const image =
        match.image ||
        match.cover ||
        match.stream_icon ||
        match.stream_logo ||
        match.movie_image ||
        null;
      if (!image) continue;

      mapped.push({
        title: item.title || item.name || match.name || match.title || "Sans titre",
        image,
        media_type: mediaType,
        stream_id: match.stream_id || null,
        series_id: match.series_id || null,
      });

      if (mapped.length >= 15) break;
    }

    const ranked = mapped.map((it, i) => ({ ...it, __rank: i + 1 }));
    return res.json(ranked);
  } catch (e) {
    console.error("trending-week-mapped error:", e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

export default tmdb;
