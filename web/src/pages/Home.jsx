// web/src/pages/Home.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import Row from "../components/Row.jsx";
import TopRow from "../components/TopRow.jsx";
import { getJson, postJson } from "../lib/api";

const HOME_MOVIE_ROWS = 6;
const HOME_SERIES_ROWS = 6;
const HOME_LIVE_ROWS = 4;
const ROW_LIMIT = 15;

const keepNonEmpty = (rows) =>
  (rows || []).filter((r) => Array.isArray(r.items) && r.items.length > 0);

// Memoized row component to prevent unnecessary re-renders
const MemoizedRow = React.memo(Row);

export default function Home() {
  const [movieRows, setMovieRows] = useState([]);
  const [loadingMovies, setLoadingMovies] = useState(true);

  const [seriesRows, setSeriesRows] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(true);

  const [liveRows, setLiveRows] = useState([]);
  const [loadingLive, setLoadingLive] = useState(true);

  // Memoized fetch function for better performance
  const fetchCategoryData = useCallback(async (endpoint, categoryKey, setRows, setLoading) => {
    try {
      const cats = await getJson(endpoint);
      const list = Array.isArray(cats) ? cats.slice(0, categoryKey === 'movies' ? HOME_MOVIE_ROWS : categoryKey === 'series' ? HOME_SERIES_ROWS : HOME_LIVE_ROWS) : [];

      const rows = await Promise.all(
        list.map(async (cat) => {
          const items = await postJson(`/xtream/${categoryKey}`, {
            category_id: Number(cat.category_id),
            limit: ROW_LIMIT,
          }).catch(() => []);
          return {
            id: Number(cat.category_id),
            title: cat.category_name || "Autre",
            items: Array.isArray(items) ? items : [],
            seeMoreHref:
              Array.isArray(items) && items.length > 0
                ? `/${categoryKey}/category/${cat.category_id}?name=${encodeURIComponent(
                    cat.category_name || "Catégorie"
                  )}`
                : null,
          };
        })
      );

      setRows(keepNonEmpty(rows));
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Films
  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) {
        await fetchCategoryData("/xtream/movie-categories", "movies", setMovieRows, setLoadingMovies);
      }
    })();
    return () => { alive = false; };
  }, [fetchCategoryData]);

  // Séries
  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) {
        await fetchCategoryData("/xtream/series-categories", "series", setSeriesRows, setLoadingSeries);
      }
    })();
    return () => { alive = false; };
  }, [fetchCategoryData]);

  // Live
  useEffect(() => {
    let alive = true;
    (async () => {
      if (alive) {
        await fetchCategoryData("/xtream/live-categories", "live", setLiveRows, setLoadingLive);
      }
    })();
    return () => { alive = false; };
  }, [fetchCategoryData]);

  // Memoize the rendered rows to prevent unnecessary re-renders
  const renderedMovieRows = useMemo(() => 
    movieRows.map((row, i) => (
      <MemoizedRow
        key={`row-m-${row.id}-${i}`}
        title={row.title}
        items={row.items}
        kind="vod"
        loading={loadingMovies}
        seeMoreHref={row.seeMoreHref}
      />
    )), [movieRows, loadingMovies]
  );

  const renderedSeriesRows = useMemo(() => 
    seriesRows.map((row, i) => (
      <MemoizedRow
        key={`row-s-${row.id}-${i}`}
        title={row.title}
        items={row.items}
        kind="series"
        loading={loadingSeries}
        seeMoreHref={row.seeMoreHref}
      />
    )), [seriesRows, loadingSeries]
  );

  const renderedLiveRows = useMemo(() => 
    liveRows.map((row, i) => (
      <MemoizedRow
        key={`row-l-${row.id}-${i}`}
        title={row.title}
        items={row.items}
        kind="live"
        loading={loadingLive}
      />
    )), [liveRows, loadingLive]
  );

  return (
    <div className="space-y-10">
      <TopRow />
      {renderedMovieRows}
      {renderedSeriesRows}
      {renderedLiveRows}
    </div>
  );
}
