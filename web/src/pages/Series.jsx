// web/src/pages/Series.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJson } from "../lib/api";

export default function Series() {
  const { id } = useParams();               // peut être TMDB id OU series_id Xtream
  const [data, setData] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    const tryEndpoints = async () => {
      setLoading(true); setErr(null);

      // 1) TMDB (mapped)
      const tmdbPaths = [
        `/tmdb/tv/${id}-mapped`,
        `/tmdb/tv/${id}`, // fallback si pas de -mapped
      ];

      // 2) Xtream
      const xtreamPaths = [
        `/xtream/series/${id}`,
        `/xstream/series/${id}`, // selon ton naming
      ];

      const tryFetch = async (paths) => {
        for (const p of paths) {
          try {
            const res = await getJson(p, { signal: ac.signal });
            if (res && typeof res === "object") return res;
          } catch (_) { /* continue */ }
        }
        return null;
      };

      // ordre: TMDB puis Xtream
      let meta = await tryFetch(tmdbPaths);
      let source = "tmdb";
      if (!meta) {
        meta = await tryFetch(xtreamPaths);
        source = meta ? "xtream" : null;
      }
      if (!alive) return;

      if (!meta || !source) {
        setErr("Aucune donnée série trouvée.");
        setLoading(false);
        return;
      }

      setData({ ...meta, __source: source });

      // Episodes
      try {
        if (source === "tmdb") {
          // si ton mapping inclut déjà les saisons/épisodes, ajuste ici
          // sinon, charge une saison par défaut (ex: 1)
          const s1 = await getJson(`/tmdb/tv/${id}/season/1-mapped`, { signal: ac.signal });
          if (Array.isArray(s1?.episodes)) setEpisodes(s1.episodes);
        } else {
          // Xtream: liste d’épisodes par series_id
          const eps = await getJson(`/xtream/series/${id}/episodes`, { signal: ac.signal });
          if (Array.isArray(eps)) setEpisodes(eps);
        }
      } catch {
        // tolérant
      } finally {
        if (alive) setLoading(false);
      }
    };

    tryEndpoints();
    return () => { alive = false; ac.abort(); };
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-300">Chargement…</div>;
  if (err) return <div className="p-6 text-red-400">{err}</div>;
  if (!data) return null;

  const title = data.name || data.title || data.original_name || "Série";
  const overview = data.overview || data.plot || data.description || "";

  // Bande-annonce
  let trailerUrl = data.trailer_url || "";
  if (!trailerUrl && Array.isArray(data.videos)) {
    const yt = data.videos.find(v => (v.site === "YouTube" || v.host === "YouTube") && (v.type === "Trailer" || v.kind === "Trailer"));
    if (yt?.key) trailerUrl = `https://www.youtube.com/watch?v=${yt.key}`;
  }

  return (
    <div className="px-4 md:px-8 lg:px-12 py-6">
      <div className="flex gap-6">
        {data.poster_path || data.poster ? (
          <img
            src={data.poster || data.poster_path}
            alt={title}
            className="w-40 md:w-48 lg:w-56 rounded-xl object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-white">{title}</h1>
          <p className="mt-3 text-zinc-300 whitespace-pre-line">{overview}</p>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {trailerUrl ? (
              <a
                href={trailerUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20"
              >
                Bande-annonce
              </a>
            ) : (
              <span className="text-sm text-zinc-400">Pas de bande-annonce disponible</span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-3">Épisodes</h2>
        {episodes.length === 0 ? (
          <div className="text-zinc-400 text-sm">Aucun épisode trouvé.</div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {episodes.map((ep) => {
              const epTitle = ep.name || ep.title || `Épisode ${ep.episode_number || ""}`;
              const thumb = ep.still_path || ep.image || ep.thumbnail || "";
              return (
                <li key={ep.id || `${ep.season_number}-${ep.episode_number}-${epTitle}`}>
                  <div className="rounded-lg overflow-hidden bg-zinc-800">
                    {thumb ? <img src={thumb} alt={epTitle} className="w-full aspect-video object-cover" loading="lazy" /> : <div className="w-full aspect-video bg-zinc-700" />}
                  </div>
                  <div className="mt-1 text-sm text-zinc-200 line-clamp-2">{epTitle}</div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
