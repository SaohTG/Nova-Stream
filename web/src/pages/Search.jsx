// web/src/pages/Search.jsx
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Row from "../components/Row.jsx";
import { getJson } from "../lib/api";

export default function SearchPage() {
  const [sp] = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const [data, setData] = useState({ movies: [], series: [], live: [] });
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const acRef = useRef(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (acRef.current) acRef.current.abort();

    if (!q) { setData({ movies: [], series: [], live: [] }); return; }
    setLoading(true);

    const ac = new AbortController();
    acRef.current = ac;

    timerRef.current = setTimeout(async () => {
      try {
        const res = await getJson(`/xtream/search?q=${encodeURIComponent(q)}`, { signal: ac.signal });
        setData({
          movies: Array.isArray(res?.movies) ? res.movies : [],
          series: Array.isArray(res?.series) ? res.series : [],
          live:   Array.isArray(res?.live)   ? res.live   : [],
        });
      } catch {
        if (!ac.signal.aborted) setData({ movies: [], series: [], live: [] });
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timerRef.current);
      ac.abort();
    };
  }, [q]);

  return (
    <div className="space-y-10 px-4">
      <h1 className="text-xl font-semibold text-white">Résultats pour “{q || "..."}”</h1>
      <Row title={`Films (${data.movies.length})`} items={data.movies} kind="vod" loading={loading} />
      <Row title={`Séries (${data.series.length})`} items={data.series} kind="series" loading={loading} />
      <Row title={`Chaînes TV (${data.live.length})`} items={data.live} kind="live" loading={loading} />
    </div>
  );
}
