// web/src/pages/Series.jsx
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getJson } from "../lib/api";

export default function Series() {
  const params = useParams();
  const id = params.id || params.seriesId || params.tmdbId; // accepte plusieurs noms
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let alive = true;
    const ac = new AbortController();

    if (!id) {
      setErr("ID série manquant dans l’URL.");
      setLoading(false);
      return () => {};
    }

    const fetchFirstOk = async (paths) => {
      for (const p of paths) {
        try {
          const res = await getJson(p, { signal: ac.signal });
          if (res && typeof res === "object") return res;
        } catch {}
      }
      return null;
    };

    (async () => {
      setLoading(true); setErr(null); setData(null);

      // TMDB prioritaire, fallback Xtream
      const tmdb = await fetchFirstOk([
        `/tmdb/tv/${encodeURIComponent(id)}-mapped`,
        `/tmdb/tv/${encodeURIComponent(id)}`
      ]);
      const meta = tmdb ?? (await fetchFirstOk([`/xtream/series/${encodeURIComponent(id)}`]));

      if (!alive) return;
      if (!meta) { setErr("Aucune information trouvée."); setLoading(false); return; }

      const title = meta.title || meta.name || meta.original_name || meta.stream_display_name || "Série";
      const overview = meta.overview || meta.plot || meta.description || "";
      const poster = meta.poster || meta.poster_path || meta.cover || meta.image || "";
      const backdrop = meta.backdrop_path || meta.backdrop || meta.fanart || "";
      const year = (meta.first_air_date || meta.release_date || meta.year || "").toString().slice(0, 4);

      let trailerUrl = meta.trailer_url || "";
      if (!trailerUrl && Array.isArray(meta.videos)) {
        const yt = meta.videos.find(v =>
          (v.site === "YouTube" || v.host === "YouTube") && ((v.type || v.kind) === "Trailer")
        );
        if (yt?.key) trailerUrl = `https://www.youtube.com/watch?v=${yt.key}`;
      }

      setData({
        title, overview, poster, backdrop, year,
        runtime: meta.episode_run_time || meta.runtime || null,
        genres: meta.genres || meta.genre_ids || [],
        rating: meta.vote_average || meta.rating || null,
        trailerUrl,
      });
      setLoading(false);
    })();

    return () => { alive = false; ac.abort(); };
  }, [id]);

  if (loading) return <div className="p-6 text-zinc-300">Chargement…</div>;
  if (err) return <div className="p-6 text-rose-300">{err}</div>;
  if (!data) return null;

  return (
    <div className="relative">
      <div className="relative h-[36vh] md:h-[48vh] lg:h-[56vh] w-full overflow-hidden rounded-b-2xl bg-zinc-900">
        {data.backdrop ? <img src={data.backdrop} alt="" className="h-full w-full object-cover opacity-60" loading="lazy" /> : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 md:px-8 lg:px-12 py-6">
          <div className="flex items-end gap-4">
            {data.poster ? <img src={data.poster} alt={data.title} className="hidden md:block w-32 md:w-36 lg:w-40 rounded-xl shadow-xl object-cover" loading="lazy" /> : null}
            <div>
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-white">
                {data.title} {data.year ? <span className="text-zinc-400 text-xl">({data.year})</span> : null}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-zinc-300">
                {Array.isArray(data.genres) && data.genres.length > 0 ? (
                  <span>{(data.genres.map(g => g.name || g).slice(0, 3)).join(" • ")}</span>
                ) : null}
                {data.runtime ? <span>• {Array.isArray(data.runtime) ? `${data.runtime[0]} min` : `${data.runtime} min`}</span> : null}
                {data.rating ? <span>• ★ {Number(data.rating).toFixed(1)}</span> : null}
              </div>
              <p className="mt-3 max-w-3xl text-zinc-200">{data.overview || "Aucun résumé."}</p>
              <div className="mt-4">
                {data.trailerUrl
                  ? <a href={data.trailerUrl} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-lg bg-white text-black px-4 py-2 text-sm font-medium hover:opacity-90">Bande-annonce</a>
                  : <span className="text-sm text-zinc-400">Pas de bande-annonce disponible</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="px-4 md:px-8 lg:px-12 py-8" />
    </div>
  );
}
