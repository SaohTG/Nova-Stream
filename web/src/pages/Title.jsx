// web/src/pages/Title.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

/* -------- Utils -------- */
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

/* -------- Page -------- */
export default function Title() {
  const { kind, id } = useParams();          // "movie" | "series"
  const xid = useMemo(() => String(id || "").replace(/^xid-/, ""), [id]);
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  const [showTrailer, setShowTrailer] = useState(false);

  // Charge les métadonnées
  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      try {
        if (kind === "series") {
          // Pour les séries on prend l’info Xtream (inclut la liste des épisodes)
          const j = await getJson(`/xtream/series-info/${encodeURIComponent(xid)}`);
          if (alive) setData(j || null);
        } else {
          // Films: payload enrichi TMDB côté API media
          const j = await getJson(`/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}`);
          if (alive) setData(j || null);
        }
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, xid]);

  // Reset lecteur à chaque changement de titre
  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
    setShowTrailer(false);
  }, [kind, xid]);

  // Overlay trailer
  useEffect(() => {
    const root = document.documentElement;
    root.style.overflow = showTrailer ? "hidden" : "";
    const onKey = (e) => { if (e.key === "Escape") setShowTrailer(false); };
    window.addEventListener("keydown", onKey);
    return () => { root.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [showTrailer]);

  /* ----- Playback: film ----- */
  async function startPlayback() {
    if (kind !== "movie") return;
    setShowTrailer(false);
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");
    try {
      // HLS proxifié avec auth; Shaka ajoute Authorization automatiquement
      const hls = `/api/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}/hls.m3u8`;
      const r = await fetch(hls, { method: "HEAD", credentials: "include" });
      setSrc(r.ok ? hls : `/api/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}/file`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

  /* ----- Playback: épisode ----- */
  async function startEpisodePlayback(seriesId, seasonNum, episodeNum) {
    if (kind !== "series") return;
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");
    try {
      const hls =
        `/api/media/series/${encodeURIComponent(seriesId)}/season/${encodeURIComponent(seasonNum)}/episode/${encodeURIComponent(episodeNum)}/hls.m3u8`;
      const r = await fetch(hls, { method: "HEAD", credentials: "include" });
      setSrc(r.ok ? hls :
        `/api/media/series/${encodeURIComponent(seriesId)}/season/${encodeURIComponent(seasonNum)}/episode/${encodeURIComponent(episodeNum)}/file`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

  /* ----- Trailer ----- */
  const trailerEmbed = useMemo(() => {
    if (kind !== "movie") return "";
    const e = data?.trailer?.embed_url;
    const u = data?.trailer?.url;
    return toYoutubeEmbed(e || u || "");
  }, [data, kind]);
  const hasTrailer = Boolean(trailerEmbed);

  /* ----- Affichage ----- */
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

  // Titre + poster selon type
  const posterSrc = kind === "series"
    ? (data?.info?.cover || data?.info?.backdrop_path || "")
    : (data.poster_url || data.backdrop_url || "");
  const titleText = kind === "series"
    ? (data?.info?.name || data?.info?.series_name || "")
    : (data.title || "");
  const overviewText = kind === "series"
    ? (data?.info?.plot || data?.info?.description || "")
    : (data.overview || "");
  const resumeKey = kind === "movie" ? `movie:${xid}` : undefined;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      {/* Trailer overlay */}
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

      {/* Lecteur */}
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
              title={titleText}
              resumeKey={resumeKey}
              resumeApi
              showPoster={false}
            />
          )}
        </div>
      )}

      {/* En-tête */}
      <div className="mb-6 flex items-center gap-4">
        {posterSrc ? (
          <img
            src={posterSrc}
            alt={titleText || ""}
            className="h-28 w-20 rounded-lg object-cover"
            draggable={false}
          />
        ) : null}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold">{titleText}</h1>
          {kind === "movie" && data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">
              Note TMDB&nbsp;: {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}
          {overviewText && (
            <p className="mt-3 max-w-3xl leading-relaxed text-zinc-200">{overviewText}</p>
          )}
          {kind === "movie" && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                className="btn bg-emerald-600 text-white hover:bg-emerald-500"
                onClick={startPlayback}
              >
                ▶ Regarder
              </button>
              <button
                className="btn disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => hasTrailer && (setPlaying(false), setShowTrailer(true))}
                disabled={!hasTrailer}
              >
                ▶ Bande-annonce
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grille saisons/épisodes pour séries */}
      {kind === "series" && (
        <SeriesSeasonsGrid
          seriesId={xid}
          info={data?.info}
          episodesBySeason={data?.episodes || {}}
          onPlay={(s, e) => startEpisodePlayback(xid, s, e)}
        />
      )}
    </div>
  );
}

/* ======= Composants séries ======= */

function SeriesSeasonsGrid({ seriesId, info, episodesBySeason, onPlay }) {
  const seasonKeys = useMemo(() => {
    const ks = Object.keys(episodesBySeason || {}).map((k) => Number(k)).filter(Number.isFinite);
    ks.sort((a,b)=>a-b);
    return ks;
  }, [episodesBySeason]);

  if (!seasonKeys.length) {
    return <div className="text-zinc-300">Aucun épisode trouvé.</div>;
  }

  return (
    <div className="space-y-8">
      {seasonKeys.map((s) => (
        <div key={`season-${s}`}>
          <h2 className="mb-3 text-xl font-semibold">Saison {s}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {(episodesBySeason[String(s)] || []).map((ep) => (
              <EpisodeCard
                key={ep?.id || `${s}-${ep?.episode_num}`}
                season={s}
                ep={ep}
                onPlay={() => onPlay(s, ep?.episode_num)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function EpisodeCard({ season, ep, onPlay }) {
  const name = ep?.title || ep?.name || ep?.episode_name || "";
  const num = ep?.episode_num;
  const display = name ? `${name}` : `Épisode ${num}`;
  const rawImg =
    ep?.stream_icon ||
    ep?.info?.movie_image ||
    ep?.info?.thumbnail ||
    ep?.info?.cover ||
    ep?.info?.img ||
    "";
  const img = /^https?:\/\//i.test(rawImg) ? `/api/xtream/image?url=${encodeURIComponent(rawImg)}` : "";

  return (
    <button
      type="button"
      onClick={onPlay}
      className="group w-full overflow-hidden rounded-xl bg-zinc-800 text-left focus:outline-none focus:ring-2 focus:ring-white/40"
      title={`S${String(season).padStart(2,"0")}E${String(num).padStart(2,"0")}`}
    >
      <div className="relative aspect-video w-full overflow-hidden">
        {img ? (
          <img src={img} alt={name || "Episode"} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="grid h-full w-full place-items-center text-zinc-400">
            S{season} • E{num}
          </div>
        )}
        <div className="absolute inset-0 hidden place-items-center bg-black/35 group-hover:grid">
          <div className="rounded-full bg-white/90 px-3 py-2 text-black text-sm">▶ Lire</div>
        </div>
      </div>
      <div className="p-2">
        <div className="line-clamp-2 text-sm text-zinc-200">
          S{String(season).padStart(2,"0")}E{String(num).padStart(2,"0")} — {display}
        </div>
      </div>
    </button>
  );
}
