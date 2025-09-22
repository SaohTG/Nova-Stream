// web/src/pages/Title.jsx
import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getJson } from "../lib/api";

export default function Title() {
  const { kind, id } = useParams(); // kind: 'movie' | 'series'
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJson(`/media/${kind}/${id}`);
        if (!alive) return;
        setData(j);
      } catch {
        if (!alive) return;
        setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, id]);

  if (loading) return <div className="py-16 text-zinc-400">Chargement…</div>;
  if (!data) return <div className="py-16 text-zinc-400">Aucune donnée.</div>;

  const img = data.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}`
    : null;
  const poster = data.poster_path
    ? `https://image.tmdb.org/t/p/w500${data.poster_path}`
    : null;

  return (
    <div className="py-6">
      {img && (
        <div
          className="mb-6 h-56 md:h-72 lg:h-80 w-full rounded-2xl bg-cover bg-center"
          style={{ backgroundImage: `url(${img})` }}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-[220px,1fr] gap-6 items-start">
        {poster && (
          <img
            src={poster}
            alt={data.title || "Poster"}
            className="w-[180px] md:w-[220px] rounded-xl shadow-xl"
            draggable={false}
          />
        )}

        <div>
          <h1 className="text-2xl md:text-3xl font-bold mb-2">{data.title || "Sans titre"}</h1>

          <div className="mb-4 text-sm text-zinc-300">
            {data.vote_average != null ? (
              <span>Note TMDB&nbsp;: <strong>{Number(data.vote_average).toFixed(1)}</strong> {data.vote_count ? `(${data.vote_count} votes)` : ""}</span>
            ) : (
              <span>Note TMDB indisponible</span>
            )}
          </div>

          <p className="text-zinc-200 leading-relaxed whitespace-pre-line">
            {data.overview || "Pas de description."}
          </p>

          <div className="mt-6 flex gap-3">
            <Link to={-1} className="btn">Retour</Link>
            {/* Tu pourras ajouter un bouton Lecture ici si tu as une route player */}
          </div>
        </div>
      </div>
    </div>
  );
}
