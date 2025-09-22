// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import Row from "../components/Row.jsx";
import TopRow from "../components/TopRow.jsx";
import { getJson, postJson } from "../lib/api";

const HOME_MOVIE_ROWS = 6;
const HOME_SERIES_ROWS = 6;
const HOME_LIVE_ROWS = 4;
const ROW_LIMIT = 15;

export default function Home() {
  const [movieRows, setMovieRows] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [seriesRows, setSeriesRows] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(true);

  const [liveRows, setLiveRows] = useState([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // Movies
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/movie-categories");
        const list = Array.isArray(cats) ? cats.slice(0, HOME_MOVIE_ROWS) : [];
        const rows = await Promise.all(
          list.map(async (cat) => {
            const items = await postJson("/xtream/movies", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
              seeMoreHref: `/movies/category/${cat.category_id}?name=${encodeURIComponent(cat.category_name || "Catégorie")}`,
            };
          })
        );
        if (alive) setMovieRows(rows);
      } catch { if (alive) setMovieRows([]); }
      finally { if (alive) setLoadingMovies(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Series
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/series-categories");
        const list = Array.isArray(cats) ? cats.slice(0, HOME_SERIES_ROWS) : [];
        const rows = await Promise.all(
          list.map(async (cat) => {
            const items = await postJson("/xtream/series", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
              seeMoreHref: `/series/category/${cat.category_id}?name=${encodeURIComponent(cat.category_name || "Catégorie")}`,
            };
          })
        );
        if (alive) setSeriesRows(rows);
      } catch { if (alive) setSeriesRows([]); }
      finally { if (alive) setLoadingSeries(false); }
    })();
    return () => { alive = false; };
  }, []);

  // Live
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cats = await getJson("/xtream/live-categories");
        const list = Array.isArray(cats) ? cats.slice(0, HOME_LIVE_ROWS) : [];
        const rows = await Promise.all(
          list.map(async (cat) => {
            const items = await postJson("/xtream/live", { category_id: Number(cat.category_id), limit: ROW_LIMIT }).catch(() => []);
            return {
              id: Number(cat.category_id),
              title: cat.category_name || "Autre",
              items: Array.isArray(items) ? items : [],
            };
          })
        );
        if (alive) setLiveRows(rows);
      } catch { if (alive) setLiveRows([]); }
      finally { if (alive) setLoadingLive(false); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-10">
      <TopRow />

      {movieRows.map((row, i) => (
        <Row key={`row-m-${row.id}-${i}`} title={row.title} items={row.items} kind="vod" loading={loadingMovies} seeMoreHref={row.seeMoreHref} />
      ))}

      {seriesRows.map((row, i) => (
        <Row key={`row-s-${row.id}-${i}`} title={row.title} items={row.items} kind="series" loading={loadingSeries} seeMoreHref={row.seeMoreHref} />
      ))}

      {liveRows.map((row, i) => (
        <Row key={`row-l-${row.id}-${i}`} title={row.title} items={row.items} kind="live" loading={loadingLive} />
      ))}
    </div>
  );
}
