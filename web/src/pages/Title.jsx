// web/src/pages/Title.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function Title() {
  const { kind, id } = useParams(); // "movie" | "series"
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTrailer, setShowTrailer] = useState(false);

  // lecture in-page
  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
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

  async function resolveStreamUrl() {
    // 1) champs possibles depuis /media
    let u =
      data?.stream_url ||
      data?.hls_url ||
      data?.m3u8 ||
      data?.url ||
      data?.playback?.src;

    // 2) appels d’API connus
    const tryApis = [
      `/media/${kind}/${id}/stream-url`,
      `/media/${kind}/${id}/stream`,
      `/xtream/stream-url?kind=${kind}&id=${id}`,
    ];
    const tryFetch = async (p) => {
      try {
        const r = await getJson(p);
        return r?.src || r?.url || r?.hls || null;
      } catch {
        return null;
      }
    };
    if (!u) {
      for (const p of tryApis) {
        // stop dès qu’on trouve une URL exploitable
        // eslint-disable-next-line no-await-in-loop
        const found = await tryFetch(p);
        if (found) { u = found; break; }
      }
    }
    return u || "";
  }

  async function startPlayback() {
    if (kind !== "movie") return;
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    const u = await resolveStreamUrl();
    if (!u) {
      setPlayErr(
        "Source vidéo introuvable. Utilisez la page de lecture dédiée."
      );
      setPlaying(false);
    } else {
      setSrc(u);
    }
    setResolvingSrc(false);
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
        Chargement…
      </div>
    );
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
  const resumeKey = kind === "movie" ? `movie:${id}` : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Player au-dessus quand la lecture démarre */}
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
          {!resolvingSrc && playErr && (
            <div className="p-4 text-center text-red-300">
              {playErr}{" "}
              <Link className="underline" to={`/watch/${kind}/${id}`}>
                Ouvrir /watch
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        {/* Miniature + overlay Play */}
        <button
          type="button"
          className="relative w-[220px] rounded-xl overflow-hidden group"
          onClick={startPlayback}
          disabled={kind !== "movie"}
          title={kind === "movie" ? "Regarder" : "Lecture non disponible ici"}
        >
          <img
            src={posterSrc}
            alt={data.title || ""}
            className="w-[220px] h-full object-cover"
            draggable={false}
          />
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

          {/* Actions */}
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
              onClick={() => hasTrailer && setShowTrailer(true)}
              disabled={!hasTrailer}
              title={hasTrailer ? "Voir la bande-annonce" : "Bande-annonce indisponible"}
            >
              ▶ Bande-annonce
            </button>
            {hasTrailer ? (
              <a className="btn" href={data.trailer.url} target="_blank" rel="noreferrer">
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
