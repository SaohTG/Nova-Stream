// web/src/pages/TitleDetail.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJson } from "../lib/api";

export default function TitleDetail() {
  const { kind, id } = useParams(); // kind: "movie" | "series"
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);

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

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">Chargement…</div>;
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-4xl p-4 text-center text-zinc-300">
        Aucune donnée.
        <div className="mt-4">
          <button onClick={() => nav(-1)} className="btn">Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="grid grid-cols-1 md:grid-cols-[200px,1fr] gap-6 items-start">
        <img
          src={data.poster_url || data.backdrop_url || ""}
          alt={data.title || ""}
          className="w-[200px] rounded-xl object-cover"
          draggable={false}
        />
        <div>
          <h1 className="text-2xl font-bold">{data.title}</h1>
          {data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">Note TMDB: {Number(data.vote_average).toFixed(1)}/10</div>
          )}
          {data.overview && <p className="mt-4 text-zinc-200 leading-relaxed">{data.overview}</p>}

          {data.trailer?.embed_url && (
            <button className="mt-6 btn" onClick={() => setShowTrailer(true)}>
              Voir la bande-annonce
            </button>
          )}
        </div>
      </div>

      {showTrailer && data.trailer?.embed_url && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setShowTrailer(false)}>
          <div className="w-full max-w-3xl aspect-video rounded-xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <iframe
              src={data.trailer.embed_url}
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
