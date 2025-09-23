// web/src/pages/Title.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getJson } from "../lib/api";

export default function Title() {
  const { kind, id } = useParams(); // "movie" | "series"
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Forcer l’upgrade TMDB pour les séries afin d’avoir overview, note, etc.
        const url = kind === "series" ? `/media/${kind}/${id}?refresh=1` : `/media/${kind}/${id}`;
        const j = await getJson(url);
        if (alive) setData(j);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, id]);

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">Chargement…</div>;
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl p-4 text-center text-zinc-300">
        Aucune donnée.
        <div className="mt-4">
          <button className="btn" onClick={() => nav(-1)}>Retour</button>
        </div>
      </div>
    );
  }

  const hasTrailer = Boolean(data?.trailer?.embed_url);
  const posterSrc = data.poster_url || data.backdrop_url || "";
  const watchHref =
    kind === "movie"
      ? `/watch/movie/${id}?rk=${encodeURIComponent(`movie:${id}`)}&title=${encodeURIComponent(
          data.title || ""
        )}&poster=${encodeURIComponent(posterSrc || "")}`
      : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        <img
          src={posterSrc}
          alt={data.title || ""}
          className="w-[220px] rounded-xl object-cover"
          draggable={false}
        />
        <div>
          <h1 className="text-2xl font-bold">{data.title}</h1>

          {data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">
              Note TMDB&nbsp;: {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}

          {data.overview && (
            <p className="mt-4 leading-relaxed text-zinc-200">{data.overview}</p>
          )}

          {/* Actions */}
          <div className="mt-6 flex items-center gap-3">
            {kind === "movie" && (
              <Link
                to={watchHref}
                className="btn bg-emerald-600 text-white hover:bg-emerald-500"
                title="Regarder le film"
              >
                ▶ Regarder
              </Link>
            )}

            <button
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => hasTrailer && setShowTrailer(true)}
              disabled={!hasTrailer}
              title={hasTrailer ? "Voir la bande-annonce" : "Bande-annonce indisponible"}
            >
              ▶ Bande-annonce
            </button>

            {hasTrailer ? (
              <a
                className="btn"
                href={data.trailer.url}
                target="_blank"
                rel="noreferrer"
                title="Ouvrir sur YouTube"
              >
                Ouvrir sur YouTube
              </a>
            ) : (
              <span className="text-sm text-zinc-400">Pas de bande-annonce disponible</span>
            )}
          </div>
        </div>
      </div>

      {/* Modale trailer */}
      {showTrailer && hasTrailer && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="w-full max-w-4xl aspect-video overflow-hidden rounded-xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              src={`${data.trailer.embed_url}${data.trailer.embed_url.includes("?") ? "&" : "?"}autoplay=1&rel=0&modestbranding=1`}
              title={data.trailer?.name || "Trailer"}
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
          <button className="mt-4 btn" onClick={() => setShowTrailer(false)}>Fermer</button>
        </div>
      )}
    </div>
  );
}
