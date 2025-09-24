// web/src/pages/Title.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function Title() {
  const { kind, id } = useParams();              // kind: "movie" | "series" ; id peut être "xid-123" ou "123"
  const xid = useMemo(() => String(id || "").replace(/^xid-/, ""), [id]); // ← nettoie le prefixe
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJson(`/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}`);
        if (alive) setData(j);
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, xid]);

  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
  }, [kind, xid]);

  async function startPlayback() {
    if (kind !== "movie") return;
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");
    try {
      // Lecture via HLS proxifié (cookies inclus via Shaka)
      setSrc(`/api/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}/hls.m3u8`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

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

  const posterSrc = data.poster_url || data.backdrop_url || "";
  const hasTrailer = Boolean(data?.trailer?.embed_url);
  const resumeKey = kind === "movie" ? `movie:${xid}` : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {playing && (
        <div className="mb-6 w-full overflow-hidden rounded-xl bg-black aspect-video">
          {resolvingSrc && (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              Préparation du flux…
            </div>
          )}
          {!resolvingSrc && src && (
            <VideoPlayer
              src={src}
              poster={posterSrc}
              title={data.title}
              resumeKey={resumeKey}
              resumeApi
            />
          )}
          {!resolvingSrc && !src && playErr && (
            <div className="flex h-full w-full items-center justify-center p-4 text-center text-red-300">
              {playErr}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        <button
          type="button"
          className="relative w-[220px] rounded-xl overflow-hidden group"
          onClick={startPlayback}
          disabled={kind !== "movie"}
          title={kind === "movie" ? "Regarder" : "Lecture non disponible ici"}
        >
          {posterSrc ? (
            <img
              src={posterSrc}
              alt={data.title || ""}
              className="w-[220px] h-full object-cover"
              draggable={false}
            />
          ) : <div className="w-[220px] h-[330px] bg-zinc-800" />}
          {kind === "movie" && (
            <div className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/40 transition">
              <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-black text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Regarder
              </div>
            </div>
          )}
        </button>

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

          <div className="mt-6 flex flex-wrap items-center gap-3">
            {kind === "movie" && (
              <button
                className="btn bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={startPlayback}
              >
                ▶ Regarder
              </button>
            )}
            <button
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => hasTrailer && window.open(data?.trailer?.url, "_blank")}
              disabled={!hasTrailer}
            >
              ▶ Bande-annonce
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
