// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import { postJson, getJson } from "../lib/api";
import Layout from "../components/Layout.jsx";
import Hero from "../components/Hero.jsx";
import Row from "../components/Row.jsx";

/* --------------------------- Normalisation & match --------------------------- */

const STOPWORDS = new Set([
  // fr
  "le", "la", "les", "un", "une", "des", "de", "du", "d", "l", "et", "en", "au", "aux", "avec",
  // en
  "the", "a", "an", "of", "and", "in", "on", "with",
]);

// tags techniques souvent présents dans les noms Xtream
const TAG_RE = new RegExp(
  String.raw`\b(2160p|1080p|720p|480p|4k|hdr|dv|x265|x264|h264|hevc|multi|truehd|dts|ac3|webrip|web[-\s]?dl|bluray|brrip|hdtv|cam|vostfr|vf|vo|french|en|fr|atmos|remux|rip)\b`,
  "gi"
);

// enlève le contenu entre [] ou (), les tags, ponctuation/repeat spaces, accents, etc.
function normTitle(s = "") {
  let t = String(s).toLowerCase();
  t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  t = t.replace(/[\[\(][^\]\)]*[\]\)]/g, " "); // [..] ou (..)
  t = t.replace(TAG_RE, " ");
  t = t.replace(/[\.:,'"!?/\\\-_|]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  // stopwords & tokens courts
  const tokens = t
    .split(" ")
    .filter((w) => w && !STOPWORDS.has(w) && w.length > 1);
  return tokens.join(" ");
}

function extractYear(s) {
  const m = String(s || "").match(/\b(19[3-9]\d|20[0-3]\d)\b/);
  return m ? Number(m[1]) : null;
}

// Dice coefficient sur jeux de tokens (façon "token set")
function diceCoefficient(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function tokenize(s) {
  return s ? s.split(" ").filter(Boolean) : [];
}

// Score global 0..100
function scoreTitle(aRaw, bRaw, tmdbYear = null) {
  const a = normTitle(aRaw);
  const b = normTitle(bRaw);
  if (!a || !b) return 0;

  // exact après normalisation
  if (a === b) return 100;

  const aT = tokenize(a);
  const bT = tokenize(b);

  let score = Math.round(diceCoefficient(aT, bT) * 100);

  // bonus si substring (souvent utile pour sous-titres, versions, etc.)
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 88);

  // bonus si l'année est visible dans le nom Xtream
  if (tmdbYear && new RegExp(`\\b${tmdbYear}\\b`).test(String(bRaw))) {
    score = Math.min(100, score + 7);
  }

  return score;
}

/* ---------------------------------- Page ---------------------------------- */

export default function Home() {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setRows([]);

        // 1) Tendances TMDB (15) — sans images TMDB
        const trending = await getJson("/tmdb/trending?media_type=all&time_window=week&limit=15");

        // 2) Récupère un pool Xtream suffisant pour matcher correctement
        //    (on reste prudent pour éviter les timeouts)
        const [movies, series, live] = await Promise.all([
          postJson("/xtream/movies", { limit: 800 }), // élargi pour mieux matcher
          postJson("/xtream/series", { limit: 800 }),
          postJson("/xtream/live",   { limit: 120 }),
        ]);

        // 3) Build index normalisé -> candidats
        const movieIdx = new Map();
        for (const it of Array.isArray(movies) ? movies : []) {
          const key = normTitle(it?.name);
          if (!key) continue;
          if (!movieIdx.has(key)) movieIdx.set(key, []);
          movieIdx.get(key).push(it);
        }
        const seriesIdx = new Map();
        for (const it of Array.isArray(series) ? series : []) {
          const key = normTitle(it?.name);
          if (!key) continue;
          if (!seriesIdx.has(key)) seriesIdx.set(key, []);
          seriesIdx.get(key).push(it);
        }

        // 4) Pour chaque tendance, cherche le meilleur match côté Xtream
        const ranked = (Array.isArray(trending) ? trending : []).map((t, idx) => {
          const title = t.title || "";
          const tmdbYear = extractYear(t.release_date);

          // a) essai exact par clé normalisée
          const key = normTitle(title);
          let candidates = [
            ...(movieIdx.get(key) || []),
            ...(seriesIdx.get(key) || []),
          ];

          // b) sinon, scan fuzzy dans de petits sous-ensembles (heuristique)
          if (candidates.length === 0) {
            // sample heuristique : on cherche parmi 200 premiers de chaque (limiter le coût)
            const poolM = (Array.isArray(movies) ? movies.slice(0, 200) : []);
            const poolS = (Array.isArray(series) ? series.slice(0, 200) : []);
            candidates = [...poolM, ...poolS]
              .map((it) => {
                const sc = scoreTitle(title, it?.name, tmdbYear);
                return { it, sc };
              })
              .filter((x) => x.sc >= 70) // seuil minimum intéressant
              .sort((a, b) => b.sc - a.sc)
              .slice(0, 6) // top candidats
              .map((x) => x.it);
          }

          // c) score final et choix du meilleur
          let best = null;
          let bestScore = -1;
          for (const it of candidates) {
            const sc = scoreTitle(title, it?.name, tmdbYear);
            if (sc > bestScore) {
              best = it;
              bestScore = sc;
            }
          }

          const image = best?.image || best?.cover || best?.stream_icon || null;

          return {
            // Pour PosterCard
            name: title,
            title,
            image, // UNIQUEMENT image Xtream
            // Info complémentaires (non affichées ici)
            tmdb_id: t.id,
            media_type: t.media_type,
            vote_average: t.vote_average,
            // rang
            rank: idx + 1,
          };
        });

        // 5) Compose la home
        const pick = (arr = [], n = 20) => arr.slice(0, n);

        const rowsData = [
          { title: "Tendances de la semaine", items: ranked, kind: "vod" },
          { title: "Films populaires", items: pick(movies, 20), kind: "vod" },
          { title: "Séries en vue", items: pick(series, 20), kind: "series" },
          { title: "Chaînes en direct", items: pick(live, 24), kind: "live" },
        ];

        if (!alive) return;
        setRows(rowsData);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur de chargement");
        setRows([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <Layout>
      <Hero />
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {!rows || rows.length === 0 ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : (
        rows.map((g, i) => (
          <Row key={`home-row-${i}`} title={g.title} items={g.items} kind={g.kind} />
        ))
      )}
    </Layout>
  );
}
