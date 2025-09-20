// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import { postJson, getJson } from "../lib/api";
import Layout from "../components/Layout.jsx";
import Hero from "../components/Hero.jsx";
import Row from "../components/Row.jsx";

// Normalisation basique des titres pour matcher TMDB <-> Xtream
function normTitle(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[\s._\-:,'"!?()]+/g, " ")
    .trim();
}

export default function Home() {
  const [rows, setRows] = useState(null);
  const [trend, setTrend] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setRows([]);
        setTrend([]);

        // 1) Récupérer tendances TMDB (sans images)
        const trending = await getJson("/tmdb/trending?media_type=all&time_window=week&limit=15");

        // 2) Charger un petit échantillon Xtream pour trouver des images correspondantes
        const [m, s, l] = await Promise.all([
          postJson("/xtream/movies", { limit: 400 }),
          postJson("/xtream/series", { limit: 400 }),
          postJson("/xtream/live",   { limit: 0 }), // pas utile pour le match des tendances
        ]);

        // Construire des maps titre -> item pour movies/séries (images Xtream uniquement)
        const mapMovie = new Map();
        for (const it of Array.isArray(m) ? m : []) {
          const key = normTitle(it?.name);
          if (key && (it?.image || it?.cover || it?.stream_icon)) {
            if (!mapMovie.has(key)) mapMovie.set(key, it);
          }
        }
        const mapSeries = new Map();
        for (const it of Array.isArray(s) ? s : []) {
          const key = normTitle(it?.name);
          if (key && (it?.image || it?.cover || it?.stream_icon)) {
            if (!mapSeries.has(key)) mapSeries.set(key, it);
          }
        }

        // 3) Composer la rangée “Tendances de la semaine”
        const ranked = (Array.isArray(trending) ? trending : []).map((t, idx) => {
          const key = normTitle(t.title);
          const hit = mapMovie.get(key) || mapSeries.get(key) || null;
          return {
            // Pour PosterCard
            name: t.title,
            title: t.title,
            image: hit?.image || hit?.cover || hit?.stream_icon || null, // jamais TMDB
            // Métadonnées pour la fiche si besoin ultérieur (on ne les affiche pas ici)
            tmdb_id: t.id,
            media_type: t.media_type,
            vote_average: t.vote_average,
            // Numérotation 1..15
            rank: idx + 1,
          };
        });

        // 4) Rangs + 3 sections “classiques”
        const rowsData = [
          { title: "Tendances de la semaine", items: ranked, kind: "vod" },
        ];

        // On ajoute aussi quelques rangées Xtream pour la home
        // (déjà groupées par catégorie dans les pages dédiées, ici on prend juste un échantillon à plat)
        const pick = (arr = [], n = 20) => arr.slice(0, n);

        rowsData.push({ title: "Films populaires", items: pick(m, 20), kind: "vod" });
        rowsData.push({ title: "Séries en vue", items: pick(s, 20), kind: "series" });
        rowsData.push({ title: "Chaînes en direct", items: pick(l, 24), kind: "live" });

        if (!alive) return;
        setTrend(ranked);
        setRows(rowsData);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur de chargement");
        setRows([]);
        setTrend([]);
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
