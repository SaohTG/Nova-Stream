// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import { postJson, getJson } from "../lib/api";
import Hero from "../components/Hero.jsx";
import Row from "../components/Row.jsx";

/* --------------------------- Normalisation & match --------------------------- */

const STOPWORDS = new Set([
  "le","la","les","un","une","des","de","du","d","l","et","en","au","aux","avec",
  "the","a","an","of","and","in","on","with",
]);

const TAG_RE = new RegExp(
  String.raw`\b(2160p|1080p|720p|480p|4k|hdr|dv|x265|x264|h264|hevc|multi|truehd|dts|ac3|webrip|web[-\s]?dl|bluray|brrip|hdtv|cam|vostfr|vf|vo|french|en|fr|atmos|remux|rip)\b`,
  "gi"
);

function normTitle(s = "") {
  let t = String(s).toLowerCase();
  t = t.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  t = t.replace(/[\[\(][^\]\)]*[\]\)]/g, " ");
  t = t.replace(TAG_RE, " ");
  t = t.replace(/[\.:,'"!?/\\\-_|]+/g, " ");
  t = t.replace(/\s+/g, " ").trim();
  const tokens = t.split(" ").filter((w) => w && !STOPWORDS.has(w) && w.length > 1);
  return tokens.join(" ");
}

function extractYear(s) {
  const m = String(s || "").match(/\b(19[3-9]\d|20[0-3]\d)\b/);
  return m ? Number(m[1]) : null;
}

function diceCoefficient(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return 0;
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function tokenize(s) { return s ? s.split(" ").filter(Boolean) : []; }

function scoreTitle(aRaw, bRaw, tmdbYear = null) {
  const a = normTitle(aRaw);
  const b = normTitle(bRaw);
  if (!a || !b) return 0;
  if (a === b) return 100;

  const aT = tokenize(a);
  const bT = tokenize(b);
  let score = Math.round(diceCoefficient(aT, bT) * 100);

  if (a.includes(b) || b.includes(a)) score = Math.max(score, 88);
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

        // Tendances TMDB (15) — sans images TMDB
        const trending = await getJson("/tmdb/trending?media_type=all&time_window=week&limit=15");

        // Pool Xtream pour matcher correctement
        const [movies, series, live] = await Promise.all([
          postJson("/xtream/movies", { limit: 800 }),
          postJson("/xtream/series", { limit: 800 }),
          postJson("/xtream/live",   { limit: 120 }),
        ]);

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

        const ranked = (Array.isArray(trending) ? trending : []).map((t, idx) => {
          const title = t.title || "";
          const tmdbYear = extractYear(t.release_date);

          const key = normTitle(title);
          let candidates = [
            ...(movieIdx.get(key) || []),
            ...(seriesIdx.get(key) || []),
          ];

          if (candidates.length === 0) {
            const poolM = (Array.isArray(movies) ? movies.slice(0, 200) : []);
            const poolS = (Array.isArray(series) ? series.slice(0, 200) : []);
            candidates = [...poolM, ...poolS]
              .map((it) => ({ it, sc: scoreTitle(title, it?.name, tmdbYear) }))
              .filter((x) => x.sc >= 70)
              .sort((a, b) => b.sc - a.sc)
              .slice(0, 6)
              .map((x) => x.it);
          }

          let best = null, bestScore = -1;
          for (const it of candidates) {
            const sc = scoreTitle(title, it?.name, tmdbYear);
            if (sc > bestScore) { best = it; bestScore = sc; }
          }

          const image = best?.image || best?.cover || best?.stream_icon || null;

          return {
            name: title,
            title,
            image,         // UNIQUEMENT image Xtream
            tmdb_id: t.id,
            media_type: t.media_type,
            vote_average: t.vote_average,
            rank: idx + 1, // #1..#15
          };
        });

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
    <>
      <Hero />
      {err && <div className="mb-4 rounded-xl bg-rose-900/40 p-3 text-rose-200">{err}</div>}

      {!rows || rows.length === 0 ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : (
        rows.map((g, i) => (
          <Row key={`home-row-${i}`} title={g.title} items={g.items} kind={g.kind} />
        ))
      )}
    </>
  );
}
