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
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
  }, [kind, id]);

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

  // ---- helpers de résolution ----
  async function probeJson(path) {
    try {
      const j = await getJson(path);
      if (!j) return null;
      if (typeof j === "string" && /^https?:/i.test(j)) return j;
      return (
        j.url ||
        j.stream_url ||
        j.hls_url ||
        j.m3u8 ||
        j.src ||
        (typeof j.playback === "object" ? j.playback.src : null) ||
        null
      );
    } catch {
      return null;
    }
  }

  async function resolveFromApi() {
    const baseCandidates = [
      `/media/${kind}/${id}/stream`,
      `/media/${kind}/${id}/stream-url`,
      `/media/${kind}/${id}/play`,
      `/media/${kind}/${id}/stream?refresh=1`,
      `/media/${kind}/${id}/stream-url?refresh=1`,
      `/media/${kind}/${id}/play?refresh=1`,
      `/xtream/stream-url?kind=${kind}&id=${id}`,
    ];
    for (const p of baseCandidates) {
      const u = await probeJson(p);
      if (u) return u;
    }
    return "";
  }

  async function resolveXtreamUrlFallback() {
    try {
      const st = await getJson("/xtream/status");
      if (!st?.linked) return "";

      const portal =
        st.base_url || st.portal_url || st.url || st.server || "";
      const base = (portal || "")
        .replace(/\/player_api\.php.*$/i, "")
        .replace(/\/portal\.php.*$/i, "")
        .replace(/\/stalker_portal.*$/i, "")
        .replace(/\/+$/g, "");
      const user = st.username || st.user || st.login;
      const pass = st.password || st.pass || st.pwd;
      if (!base || !user || !pass) return "";

      // deviner un id xtream depuis les données
      const vid =
        data?.xtream_id ||
        data?.movie_id ||
        data?.vod_id ||
        data?.stream_id ||
        data?.ids?.xtream ||
        null;
      if (!vid || kind !== "movie") return "";

      return `${base}/movie/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${vid}.m3u8`;
    } catch {
      return "";
    }
  }

  async function startPlayback() {
    if (kind !== "movie") return; // limiter ici aux films
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");

    try {
      // 1) champs directs du payload /media
      let u =
        data?.stream_url ||
        data?.hls_url ||
        data?.m3u8 ||
        data?.url ||
        (data?.playback && data.playback.src);

      // 2) endpoints backend connus
      if (!u) u = await resolveFromApi();

      // 3) fallback xtream local si id présent
      if (!u) u = await resolveXtreamUrlFallback();

      if (!u) throw new Error("no-src");

      setSrc(u);
    } catch (e) {
      console.warn("[play]", e);
      setPlayErr(
        "Impossible d’obtenir l’URL du flux. Vérifiez que l’API expose /media/:kind/:id/(stream|stream-url|play) ou fournisse un id Xtream."
      );
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

  const hasTrailer = Boolean(data?.trailer?.embed_url);
  const posterSrc = data.poster_url || data.backdrop_url || "";
  const resumeKey = kind === "movie" ? `movie:${id}` : undefined;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* lecteur en haut si lecture */}
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
              <div>
                <div>{playErr}</div>
                <div className="mt-3">
                  <Link className="underline" to={`/watch/${kind}/${id}`}>Essayer sur /watch</Link>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[220px,1fr]">
        {/* miniature + overlay play */}
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

      {/* modale trailer */}
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
