import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import Row from "../components/Row.jsx";
import { getJson } from "../lib/api";

export default function SearchPage() {
  const [sp] = useSearchParams();
  const q = (sp.get("q") || "").trim();
  const [data, setData] = useState({ movies: [], series: [], live: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!q) { setData({ movies: [], series: [], live: [] }); return; }
    setLoading(true);
    (async () => {
      try {
        const res = await getJson(`/xtream/search?q=${encodeURIComponent(q)}`);
        if (!alive) return;
        setData({
          movies: Array.isArray(res?.movies) ? res.movies : [],
          series: Array.isArray(res?.series) ? res.series : [],
          live:   Array.isArray(res?.live)   ? res.live   : [],
        });
      } catch {
        if (!alive) return;
        setData({ movies: [], series: [], live: [] });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [q]);

  return (
    <div className="space-y-10 px-4">
      <h1 className="text-xl font-semibold text-white">
        Résultats pour “{q || "..."}”
      </h1>

      <Row title={`Films (${data.movies.length})`} items={data.movies} kind="vod" loading={loading} />
      <Row title={`Séries (${data.series.length})`} items={data.series} kind="series" loading={loading} />
      <Row title={`Chaînes TV (${data.live.length})`} items={data.live} kind="live" loading={loading} />
    </div>
  );
}
