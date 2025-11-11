// web/src/pages/Home.jsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import Row from "../components/Row.jsx";
import TopRow from "../components/TopRow.jsx";
import { getJson, postJson } from "../lib/api";
import { getCached, setCached } from "../lib/clientCache";

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

  // Memoized fetch function for better performance with client-side cache
  const fetchCategoryData = useCallback(async (endpoint, categoryKey, setRows, setLoading) => {
    const cacheKey = `home-${categoryKey}`;
    
    // Vérifier le cache client d'abord
    const cached = getCached(cacheKey);
    if (cached) {
      setRows(cached);
      setLoading(false);
      return;
    }
    
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

      const result = keepNonEmpty(rows);
      setRows(result);
      
      // Mettre en cache côté client (5 min)
      if (result.length > 0) {
        setCached(cacheKey, result);
      }
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

  const hasContent = movieRows.length > 0 || seriesRows.length > 0 || liveRows.length > 0;
  const allLoaded = !loadingMovies && !loadingSeries && !loadingLive;

  return (
    <div className="space-y-10">
      <TopRow />
      
      {/* Message si aucun contenu après chargement */}
      {allLoaded && !hasContent && (
        <div className="card p-8 text-center max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary-500/20 mb-4">
            <svg className="w-8 h-8 text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold mb-2">Aucun contenu disponible</h3>
          <p className="text-zinc-400 mb-4">
            Votre serveur Xtream semble être temporairement inaccessible ou n'a pas de contenu disponible.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={() => window.location.reload()}
              className="btn-secondary"
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Réessayer
            </button>
            <a
              href="/settings"
              className="glass-button"
            >
              <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Vérifier les paramètres
            </a>
          </div>
        </div>
      )}
      
      {renderedMovieRows}
      {renderedSeriesRows}
      {renderedLiveRows}
    </div>
  );
}
