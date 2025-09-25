// web/src/pages/Title.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

function toYoutubeEmbed(urlOrId = "") {
  if (!urlOrId) return "";
  if (/^https?:\/\/(www\.)?youtube\.com\/embed\//.test(urlOrId)) return urlOrId;
  try {
    if (/^https?:\/\//i.test(urlOrId)) {
      const u = new URL(urlOrId);
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.replace(/^\//, "");
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }
      if (u.hostname.includes("youtube.com")) {
        const id = u.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : "";
      }
    }
  } catch {}
  return `https://www.youtube.com/embed/${urlOrId}`;
}

function Spinner({ label = "Chargement…" }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-zinc-300">
      <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4A4 4 0 0 0 8 12H4z"/>
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}

export default function Title() {
  const { kind, id } = useParams();
  const xid = useMemo(() => String(id || "").replace(/^xid-/, ""), [id]);
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);

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
    setShowTrailer(false);
  }, [kind, xid]);

  useEffect(() => {
    const root = document.documentElement;
    if (showTrailer) root.style.overflow = "hidden";
    else root.style.overflow = "";
    const onKey = (e) => { if (e.key === "Escape") setShowTrailer(false); };
    window.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [showTrailer]);

  async function startPlayback() {
    if (kind !== "movie") return;
    setShowTrailer(false);
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");
    try {
      setSrc(`/api/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}/hls.m3u8`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

  const trailerEmbed = useMemo(() => {
    const e = data?.trailer?.embed_url;
    const u = data?.trailer?.url;
    return toYoutubeEmbed(e || u || "");
  }, [data]);
  const hasTrailer = Boolean(trailerEmbed);

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
  const resumeKey = kind === "movie" ? `movie:${xid}` : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {showTrailer && hasTrailer && (
        <div
          className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-sm grid place-items-center p-4"
          onClick={() => setShowTrailer(false)}
        >
          <div
            className="relative w-full max-w-5xl aspect-video rounded-xl overflow-hidden bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <iframe
              className="h-full w-full"
              src={`${trailerEmbed}?autoplay=1&rel=0`}
              title="Bande-annonce"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
            <button
              type="button"
              onClick={() => setShowTrailer(false)}
              className="absolute top-3 right-3 rounded-full bg-white/90 px-3 py-1 text-black text-sm hover:bg-white"
              title="Fermer"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {!showTrailer && playing && (
        <div className="mb-6 w-full overflow-hidden rounded-xl bg-black aspect-video">
          {!src ? (
            <div className="flex h-full w-full items-center justify-center">
              <Spinner label="Préparation du flux…" />
            </div>
          ) : playErr ? (
            <div className="flex h-full w-full items-center justify-center p-4 text-center text-red-300">
              {playErr}
            </div>
          ) : (
            <VideoPlayer
              src={src}
              poster={posterSrc}
              title={data.title}
              resumeKey={resumeKey}
              resumeApi
              showPoster={false}
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        <button
          type="button"
          className={`relative w-[220px] rounded-xl overflow-hidden group ${resolvingSrc ? "cursor-wait" : ""}`}
          onClick={startPlayback}
          disabled={kind !== "movie" || resolvingSrc}
          title={kind === "movie" ? "Regarder" : "Lecture non disponible ici"}
          aria-busy={resolvingSrc ? "true" : "false"}
        >
          {resolvingSrc ? (
            <div className="w-[220px] h-[330px] bg-zinc-900 grid place-items-center">
              <Spinner />
            </div>
          ) : posterSrc ? (
            <img
              src={posterSrc}
              alt={data.title || ""}
              className="w-[220px] h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-[220px] h-[330px] bg-zinc-800" />
          )}
          {kind === "movie" && !resolvingSrc && (
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
            <button
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => hasTrailer && (setPlaying(false), setShowTrailer(true))}
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
