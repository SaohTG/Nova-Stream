// web/src/pages/Title.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function Title() {
  const { kind, id } = useParams(); // "movie" | "series"
  const nav = useNavigate();
  const loc = useLocation();
  const [qs] = useSearchParams();

  const isXid = typeof id === "string" && id.startsWith("xid-");
  const xid = isXid ? id.slice(4) : null;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  // optionnels
  const directUrlQS = qs.get("url") || loc.state?.playUrl || null;

  // Charge les métadonnées:
  // - si xid-… → récup Xtream, puis map TMDB par titre(+année)
  // - sinon    → TMDB direct via id (TMDB)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (isXid && kind === "movie") {
          const xi = await getJson(`/xtream/vod-info/${encodeURIComponent(xid)}`);
          const xtTitle =
            xi?.movie_data?.name ||
            xi?.info?.name ||
            xi?.movie_data?.movie_name ||
            xi?.info?.o_name || "";
          const xtYear =
            (xi?.movie_data?.releasedate && String(xi.movie_data.releasedate).slice(0,4)) ||
            (xi?.info?.releasedate && String(xi.info.releasedate).slice(0,4)) || "";
          let meta = null;
          try {
            const url = `/media/resolve-by-title?kind=movie&title=${encodeURIComponent(xtTitle)}${xtYear ? `&year=${xtYear}` : ""}`;
            meta = await getJson(url);
          } catch {}
          const cover = xi?.movie_data?.cover_big || xi?.movie_data?.movie_image || "";
          const payload = meta || {
            kind: "movie",
            title: xtTitle || "(sans titre)",
            overview: null,
            vote_average: null,
            poster_url: cover || null,
            backdrop_url: cover || null,
            data: { xtream_only: true },
          };
          if (alive) setData(payload);
        } else if (isXid && kind === "series") {
          const si = await getJson(`/xtream/series-info/${encodeURIComponent(xid)}`);
          const xtTitle =
            si?.info?.name || si?.info?.o_name || si?.info?.title || "";
          const xtYear =
            (si?.info?.releasedate && String(si.info.releasedate).slice(0,4)) ||
            (si?.info?.first_air_date && String(si.info.first_air_date).slice(0,4)) || "";
          let meta = null;
          try {
            const url = `/media/resolve-by-title?kind=series&title=${encodeURIComponent(xtTitle)}${xtYear ? `&year=${xtYear}` : ""}`;
            meta = await getJson(url);
          } catch {}
          const cover = si?.info?.cover || si?.info?.backdrop_path || "";
          const payload = meta || {
            kind: "series",
            title: xtTitle || "(sans titre)",
            overview: null,
            vote_average: null,
            poster_url: cover || null,
            backdrop_url: cover || null,
            data: { xtream_only: true },
          };
          if (alive) setData(payload);
        } else {
          // chemin TMDB natif
          const url = kind === "series" ? `/media/${kind}/${id}?refresh=1` : `/media/${kind}/${id}`;
          const j = await getJson(url);
          if (alive) setData(j);
        }
      } catch {
        if (alive) setData(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [kind, id, isXid, xid]);

  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
  }, [kind, id, isXid, xid]);

  const resumeKey = useMemo(() => {
    if (kind === "movie") return isXid ? `movie:xid:${xid}` : `movie:${id}`;
    if (kind === "series") return isXid ? `series:xid:${xid}` : `series:${id}`;
    return undefined;
  }, [kind, id, isXid, xid]);

  async function startPlayback() {
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");

    try {
      const title = loc.state?.title || data?.title || "";

      // si on a un XID, on passe direct par lui
      const u = `/media/play-src?kind=${encodeURIComponent(kind)}` +
                (isXid ? `&xid=${encodeURIComponent(xid)}` : (title ? `&title=${encodeURIComponent(title)}` : "")) +
                (directUrlQS ? `&url=${encodeURIComponent(directUrlQS)}` : "");

      const r = await getJson(u);
      if (!r?.src) throw new Error("no_source");
      setSrc(r.src);
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
        <div className="mt-4"><button className="btn" onClick={() => nav(-1)}>Retour</button></div>
      </div>
    );
  }

  const posterSrc = loc.state?.poster || data.poster_url || data.backdrop_url || "";
  const title = loc.state?.title || data.title || "";

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
            <VideoPlayer src={src} poster={posterSrc} title={title} resumeKey={resumeKey} resumeApi />
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
          title="Regarder"
        >
          <img
            src={posterSrc}
            alt={title}
            className="w-[220px] h-full object-cover"
            draggable={false}
          />
          <div className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/40 transition">
            <div className="flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-black text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M8 5v14l11-7z" />
              </svg>
              Regarder
            </div>
          </div>
        </button>

        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {data.vote_average != null && (
            <div className="mt-1 text-sm text-zinc-300">
              Note TMDB : {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}
          {data.overview && (
            <p className="mt-4 leading-relaxed text-zinc-200">{data.overview}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button className="btn bg-emerald-600 text-white hover:bg-emerald-500" onClick={startPlayback}>
              ▶ Regarder
            </button>
            <button
              className="btn disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={() => data?.trailer?.url && window.open(data.trailer.url, "_blank")}
              disabled={!data?.trailer?.url}
            >
              ▶ Bande-annonce
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
