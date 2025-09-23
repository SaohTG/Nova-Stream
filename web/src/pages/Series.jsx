// web/src/pages/Series.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getJson } from "../lib/api";
import Row from "../components/Row.jsx";

export default function Series() {
  const { id } = useParams(); // id TMDB ou series_id Xtream
  const [meta, setMeta] = useState(null);
  const [episodes, setEpisodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    const fetchFirst = async (paths) => {
      for (const p of paths) {
        try {
          const res = await getJson(p, { signal: ac.signal });
          if (res && typeof res === "object") return res;
        } catch (_) {}
      }
      return null;
    };

    (async () => {
      setLoading(true); setErr(null); setMeta(null); setEpisodes([]);

      // 1) TMDB mappé, puis brut
      const tmdb = await fetchFirst([
        `/tmdb/tv/${id}-mapped`,
        `/tmdb/tv/${id}`
      ]);

      // 2) Xtream si TMDB absent
      const data = tmdb ?? (await fetchFirst([`/xtream/series/${id}`]));
      if (!alive) return;

      if (!data) {
        setErr("Aucune information série trouvée.");
        setLoading(false);
        return;
      }

      const source = tmdb ? "tmdb" : "xtream";
      setMeta({ ...data, __source: source });

      // Épisodes
      try {
        if (source === "tmdb") {
          // Essaye la saison 1 mappée puis brute
          const s1 = await fetchFirst([
            `/tmdb/tv/${id}/season/1-mapped`,
            `/tmdb/tv/${id}/season/1`
          ]);
          const eps = Array.isArray(s1?.episodes) ? s1.episodes : [];
          setEpisodes(eps);
        } else {
          const eps = await fetchFirst([
            `/xtream/series/${id}/episodes`
          ]);
          setEpisodes(Array.isArray(eps) ? eps : []);
        }
      } catch (_) {}
      if (alive) setLoading(false);
    })();

    return () => { alive = false; ac.abort(); };
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-300">Chargement…</div>;
  if (err) return <div className="p-6 text-rose-300">{err}</div>;
  if (!meta) return null;

  const title = meta.name || meta.title || meta.original_name || "Série";
  const overview = meta.overview || meta.plot || meta.description || "";
  const poster = meta.poster || meta.poster_path || meta.cover || "";
  const year =
    meta.first_air_date?.slice(0,4) ||
    meta.release_date?.slice(0,4) ||
    meta.year || "";

  // Trailer
  let trailerUrl = meta.trailer_url || "";
  if (!trailerUrl && Array.isArray(meta.videos)) {
    const yt = meta.videos.find(v =>
      (v.site === "YouTube" || v.host === "YouTube") &&
      ((v.type || v.kind) === "Trailer")
    );
    if (yt?.key) trailerUrl = `https://www.youtube.com/watch?v=${yt.key}`;
  }

  return (
    <div className="px-4 md:px-8 lg:px-12 py-6">
      <div className="flex flex-col md:flex-row gap-6">
        {poster ? (
          <img
            src={poster}
            alt={title}
            className="w-40 md:w-48 lg:w-56 rounded-xl object-cover"
            loading="lazy"
          />
        ) : null}

        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            {title} {year ? <span className="text-zinc-400 text-xl">({year})</span> : null}
          </h1>

          <p className="mt-3 text-zinc-300 whitespace-pre-line">{overview || "Aucun résumé."}</p>

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
            <Link
              to="/series"
              className="inline-flex items-center rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-200 ring-1 ring-white/10 hover:bg-zinc-700"
            >
              Retour aux séries
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-xl font-semibold text-white mb-3">Épisodes</h2>
        {episodes.length === 0 ? (
          <div className="text-zinc-400 text-sm">Aucun épisode trouvé.</div>
        ) : (
          <ul className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {episodes.map((ep, i) => {
              const epTitle = ep.name || ep.title || `Épisode ${ep.episode_number ?? i+1}`;
              const thumb = ep.still_path || ep.image || ep.thumbnail || "";
              const num = ep.episode_number ?? i+1;
              return (
                <li key={ep.id || `${num}-${epTitle}`}>
                  <div className="rounded-lg overflow-hidden bg-zinc-800">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={epTitle}
                        className="w-full aspect-video object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full aspect-video bg-zinc-700" />
                    )}
                  </div>
                  <div className="mt-1 text-sm text-zinc-200 line-clamp-2">
                    {num ? `E${String(num).padStart(2,"0")} · ` : ""}{epTitle}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Optionnel: recommandations si dispo dans le mapping */}
      {Array.isArray(meta.recommendations) && meta.recommendations.length > 0 && (
        <div className="mt-10">
          <Row title="Vous pourriez aimer" items={meta.recommendations} kind="series" />
        </div>
      )}
    </div>
  );
}
