// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import Row from "../components/Row.jsx";
import TopRow from "../components/TopRow.jsx";
import { getJson, postJson } from "../lib/api";

const HOME_MOVIE_ROWS = 6;   // nombre de catégories films à afficher
const HOME_SERIES_ROWS = 6;  // nombre de catégories séries à afficher
const HOME_LIVE_ROWS = 4;    // nombre de catégories live à afficher
const ROW_LIMIT = 15;        // nombre d’éléments par row

export default function Home() {
  // Trending (Top 15)
  const [trending, setTrending] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(true);

  // Movies rows
  const [movieRows, setMovieRows] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(true);

  // Series rows
  const [seriesRows, setSeriesRows] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(true);

  // Live rows
  const [liveRows, setLiveRows] = useState([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // --- Load Trending (Top 15) ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Idéal: endpoint qui renvoie déjà les tendances TMDB mappées vers des affiches Xtream
        // (images Xtream uniquement)
        let data;
        try {
          data = await getJson("/tmdb/trending-week-mapped");
        } catch {
          data = null;
        }

        // Fallback si l’endpoint n’existe pas: on prend 15 films Xtream récents/généraux
        if (!data || !Array.isArray(data) || data.length === 0) {
          const list = await postJson("/xtream/movies", { limit: 30 }); // on sur-demande un peu
          data = Array.isArray(list) ? list.slice(0, 15) : [];
        }

        const top = (data || []).slice(0, 15).map((it, i) => ({ ...it, __rank: i + 1 }));
        if (!alive) return;
        setTrending(top);
      } catch {
        if (!alive) return;
        setTrending([]);
      } finally {
        if (alive) setLoadingTrend(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // --- Load Movies rows by categories ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/movie-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_MOVIE_ROWS) : [];

        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/movies", {
              category_id: Number(cat.category_id),
              limit: ROW_LIMIT,
            }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
              seeMoreHref: `/movies/category/${cat.category_id}?name=${encodeURIComponent(cat.category_name || "Catégorie")}`,
            };
          })
        );

        if (!alive) return;
        setMovieRows(rows);
      } catch {
        if (!alive) return;
        setMovieRows([]);
      } finally {
        if (alive) setLoadingMovies(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // --- Load Series rows by categories ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/series-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_SERIES_ROWS) : [];

        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/series", {
              category_id: Number(cat.category_id),
              limit: ROW_LIMIT,
            }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
              seeMoreHref: `/series/category/${cat.category_id}?name=${encodeURIComponent(cat.category_name || "Catégorie")}`,
            };
          })
        );

        if (!alive) return;
        setSeriesRows(rows);
      } catch {
        if (!alive) return;
        setSeriesRows([]);
      } finally {
        if (alive) setLoadingSeries(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // --- Load Live rows by categories ---
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/live-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_LIVE_ROWS) : [];

        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/live", {
              category_id: Number(cat.category_id),
              limit: ROW_LIMIT,
            }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
              // seeMoreHref: `/live?cat=${cat.category_id}` // active si /live sait filtrer
            };
          })
        );

        if (!alive) return;
        setLiveRows(rows);
      } catch {
        if (!alive) return;
        setLiveRows([]);
      } finally {
        if (alive) setLoadingLive(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-10">
      {/* Top 15 – Tendances de la semaine (numéros en overlay) */}
      <TopRow
        title="Tendances de la semaine"
        items={trending}
        kind="vod"
        loading={loadingTrend}
      />

      {/* Films par catégories */}
      {movieRows.map((row, i) => (
        <Row
          key={`row-m-${row.id}-${i}`}
          title={row.title}
          items={row.items}
          kind="vod"
          loading={loadingMovies}
          seeMoreHref={row.seeMoreHref}
        />
      ))}

      {/* Séries par catégories */}
      {seriesRows.map((row, i) => (
        <Row
          key={`row-s-${row.id}-${i}`}
          title={row.title}
          items={row.items}
          kind="series"
          loading={loadingSeries}
          seeMoreHref={row.seeMoreHref}
        />
      ))}

      {/* TV par catégories */}
      {liveRows.map((row, i) => (
        <Row
          key={`row-l-${row.id}-${i}`}
          title={row.title}
          items={row.items}
          kind="live"
          loading={loadingLive}
          // seeMoreHref={row.seeMoreHref}
        />
      ))}
    </div>
  );
}
