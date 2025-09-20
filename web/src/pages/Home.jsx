// web/src/pages/Home.jsx
import { useEffect, useState } from "react";
import { postJson } from "../lib/api";
import Hero from "../components/Hero.jsx";
import Row from "../components/Row.jsx";

export default function Home() {
  const [movies, setMovies] = useState(null);
  const [series, setSeries] = useState(null);
  const [live, setLive] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        const [m, s, l] = await Promise.all([
          postJson("/xtream/movies", { limit: 120 }),
          postJson("/xtream/series", { limit: 120 }),
          postJson("/xtream/live",   { limit: 120 }),
        ]);
        if (!alive) return;
        setMovies(Array.isArray(m) ? m : []);
        setSeries(Array.isArray(s) ? s : []);
        setLive(Array.isArray(l) ? l : []);
      } catch (e) {
        if (!alive) return;
        setErr(e?.message || "Erreur de chargement");
        setMovies([]); setSeries([]); setLive([]);
      }
    })();
    return () => { alive = false; };
  }, []);

  const heroItem = movies?.[0] || series?.[0] || live?.[0] || null;

  return (
    <>
      {heroItem && <Hero item={heroItem} />}

      {err && (
        <div className="mb-6 rounded-xl bg-rose-900/40 p-4 text-rose-200">
          {err}
        </div>
      )}

      {!movies && !series && !live ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : (
        <>
          {!!movies?.length && <Row title="Tendances Films" items={movies} kind="vod" />}
          {!!series?.length && <Row title="À la une Séries" items={series} kind="series" />}
          {!!live?.length && <Row title="Chaînes TV" items={live} kind="live" />}
        </>
      )}
    </>
  );
}
