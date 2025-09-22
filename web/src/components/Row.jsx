// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import Row from "../components/Row.jsx";
import { getJson, postJson } from "../lib/api";

const HOME_MOVIE_ROWS = 6;
const HOME_SERIES_ROWS = 6;
const HOME_LIVE_ROWS = 4;
const ROW_LIMIT = 15;

export default function Home() {
  const [trending, setTrending] = useState([]);
  const [loadingTrend, setLoadingTrend] = useState(true);

  const [movieRows, setMovieRows] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [seriesRows, setSeriesRows] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(true);

  const [liveRows, setLiveRows] = useState([]);
  const [loadingLive, setLoadingLive] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await getJson("/tmdb/trending-week-mapped");
        const top = Array.isArray(data)
          ? data.slice(0, 15).map((it, i) => ({ ...it, __rank: i + 1 }))
          : [];
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

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/movie-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_MOVIE_ROWS) : [];
        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/movies", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
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
      } catch { if (!alive) return; setMovieRows([]); }
      finally { if (alive) setLoadingMovies(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/series-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_SERIES_ROWS) : [];
        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/series", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
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
      } catch { if (!alive) return; setSeriesRows([]); }
      finally { if (alive) setLoadingSeries(false); }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/live-categories");
        const listCats = Array.isArray(cats) ? cats.slice(0, HOME_LIVE_ROWS) : [];
        const rows = await Promise.all(
          listCats.map(async (cat) => {
            const items = await postJson("/xtream/live", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
            };
          })
        );
        if (!alive) return;
        setLiveRows(rows);
      } catch { if (!alive) return; setLiveRows([]); }
      finally { if (alive) setLoadingLive(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-10">
      <Row
        title="Tendances de la semaine"
        items={trending}
        kind="vod"
        loading={loadingTrend}
        showRank={true}        // ← affiche les numéros translucides
      />

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

      {liveRows.map((row, i) => (
        <Row
          key={`row-l-${row.id}-${i}`}
          title={row.title}
          items={row.items}
          kind="live"
          loading={loadingLive}
        />
      ))}
    </div>
  );
}
