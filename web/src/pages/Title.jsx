// web/src/pages/Title.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

/* ---------- Helpers ---------- */
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

// Ne prend que TMDB (ou un champ trailer déjà donné par l’API), pas d’ouverture externe
function pickTmdbTrailerEmbed(data) {
  // TMDB videos éventuelles dans le payload
  const tmdbVideos =
    data?.data?.videos?.results ||
    data?.videos?.results ||
    data?.info?.videos?.results ||
    [];

  const ytFromVideos = (() => {
    const arr = Array.isArray(tmdbVideos) ? tmdbVideos : [];
    const pick = (type) =>
      arr.find(
        (v) =>
          String(v?.site).toLowerCase() === "youtube" &&
          String(v?.type).toLowerCase() === type &&
          v?.key
      );
    const t = pick("trailer") || pick("teaser");
    return t?.key ? `https://www.youtube.com/embed/${t.key}` : null;
  })();

  // Autorise un champ déjà mappé côté API s’il existe
  const direct =
    data?.trailer?.embed_url ||
    data?.trailer?.url ||
    data?.trailer?.youtube_id ||
    data?.trailer?.id ||
    "";

  const raw = ytFromVideos || direct || "";
  return raw ? toYoutubeEmbed(raw) : "";
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

/* ---------- Page ---------- */
export default function Title() {
  const { kind, id } = useParams();
  const [search] = useSearchParams();
  const xid = useMemo(() => String(id || "").replace(/^xid-/, ""), [id]);
  const nav = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  const [currentResumeKey, setCurrentResumeKey] = useState(null);
  const [showTrailer, setShowTrailer] = useState(false);

  const startAtQ = useMemo(() => {
    const v = Number(search.get("t") || 0);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [search]);

  // Fetch data
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (kind === "series") {
          const j = await getJson(`/xtream/series-info/${encodeURIComponent(xid)}`);
          if (alive) setData(j);
        } else {
          const j = await getJson(`/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}`);
          if (alive) setData(j);
        }
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, xid]);

  // Reset on id change
  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
    setShowTrailer(false);
    setCurrentResumeKey(null);
  }, [kind, xid]);

  // Lock scroll when trailer shown
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
    setCurrentResumeKey(`movie:${xid}`);
    try {
      setSrc(`/api/media/${encodeURIComponent(kind)}/${encodeURIComponent(xid)}/hls.m3u8`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

  async function startEpisodePlayback(seriesId, seasonNum, episodeNum) {
    if (kind !== "series") return;
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");
    setCurrentResumeKey(`series:${seriesId}:S${seasonNum}E${episodeNum}`);
    try {
      const hls = `/api/media/series/${encodeURIComponent(seriesId)}/season/${encodeURIComponent(seasonNum)}/episode/${encodeURIComponent(episodeNum)}/hls.m3u8`;
      const r = await fetch(hls, { method: "HEAD", credentials: "include" });
      setSrc(r.ok ? hls :
        `/api/media/series/${encodeURIComponent(seriesId)}/season/${encodeURIComponent(seasonNum)}/episode/${encodeURIComponent(episodeNum)}/file`);
    } catch {
      setPlayErr("Aucune source de lecture fournie par le serveur.");
    } finally {
      setResolvingSrc(false);
    }
  }

  // Autoplay via query
  useEffect(() => {
    const auto = search.get("play") === "1";
    if (!auto || loading || !data) return;
    if (kind === "movie") startPlayback();
    if (kind === "series") {
      const s = Number(search.get("season") || 1);
      const e = Number(search.get("episode") || 1);
      startEpisodePlayback(xid, s, e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, loading, data, kind, xid]);

  // Trailer (TMDB only)
  const trailerEmbed = useMemo(() => pickTmdbTrailerEmbed(data), [data]);
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

  const posterSrc =
    kind === "series"
      ? (data?.info?.cover || data?.info?.backdrop_path || "")
      : (data.poster_url || data.backdrop_url || "");
  const movieTitle = data?.title || "";
  const seriesTitle = data?.info?.name || data?.info?.series_name || "";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6">
      {/* Trailer modal (toujours sur la page) */}
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

      {/* Player area */}
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
              title={kind === "series" ? seriesTitle : movieTitle}
              resumeKey={currentResumeKey || (kind === "movie" ? `movie:${xid}` : undefined)}
              resumeApi
              showPoster={false}
              startAt={startAtQ}
            />
          )}
        </div>
      )}

      {/* Details */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        {/* Poster (clic = lecture pour films) */}
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
              alt={(kind === "series" ? seriesTitle : movieTitle)}
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
          <h1 className="text-2xl font-bold">
            {kind === "series" ? seriesTitle : movieTitle}
          </h1>
          {kind === "movie" && data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">
              Note TMDB&nbsp;: {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}
          {(kind === "movie" ? data.overview : (data?.info?.plot || data?.info?.description)) && (
            <p className="mt-4 leading-relaxed text-zinc-200">
              {kind === "movie" ? data.overview : (data?.info?.plot || data?.info?.description)}
            </p>
          )}

          {/* Bouton Bande-annonce uniquement si une vidéo TMDB est disponible */}
          {hasTrailer && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className="btn"
                onClick={() => { setPlaying(false); setShowTrailer(true); }}
                title="Voir la bande-annonce"
              >
                ▶ Bande-annonce
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Grille des épisodes (séries) */}
      {kind === "series" && (
        <SeriesSeasonsGrid
          seriesId={xid}
          episodesBySeason={data?.episodes || {}}
          onPlay={(s, e) => startEpisodePlayback(xid, s, e)}
        />
      )}
    </div>
  );
}

/* ====== Séries: grilles ====== */

function SeriesSeasonsGrid({ seriesId, episodesBySeason, onPlay }) {
  const seasonKeys = useMemo(() => {
    const ks = Object.keys(episodesBySeason || {}).map((k) => Number(k)).filter(Number.isFinite);
    ks.sort((a,b)=>a-b);
    return ks;
  }, [episodesBySeason]);

  if (!seasonKeys.length) return <div className="text-zinc-300">Aucun épisode trouvé.</div>;

  return (
    <div className="mt-8 space-y-8">
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
          S{String(season).padStart(2,"0")}E{String(num).padStart(2,"0")} — {name || `Épisode ${num}`}
        </div>
      </div>
    </button>
  );
}
