// web/src/pages/Title.jsx
import { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { getJson } from "../lib/api";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function Title() {
  const { kind, id } = useParams(); // "movie" | "series" ; id = TMDB id
  const nav = useNavigate();
  const loc = useLocation();
  const [qs] = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // lecture in-page
  const [playing, setPlaying] = useState(false);
  const [resolvingSrc, setResolvingSrc] = useState(false);
  const [src, setSrc] = useState("");
  const [playErr, setPlayErr] = useState("");

  // title/poster éventuels passés via state
  const titleFromState = loc.state?.title || "";
  const posterFromState = loc.state?.poster || "";

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

  useEffect(() => {
    setPlaying(false);
    setResolvingSrc(false);
    setSrc("");
    setPlayErr("");
  }, [kind, id]);

  const resumeKey = useMemo(() => {
    if (kind === "movie") return `movie:${id}`;
    // séries: si tu joues un épisode ici, passe éventuellement un resumeKey via loc.state
    return loc.state?.resumeKey || undefined;
  }, [kind, id, loc.state]);

  // -------- helpers côté front --------
  const accQS = qs.get("acc") || loc.state?.accId || null;   // accountId Xtream
  const xidQS = qs.get("xid") || loc.state?.xtreamId || null; // xtreamId (vod/episode/live)

  async function getDefaultAccId() {
    // Tente d’obtenir un accountId depuis /xtream/status
    try {
      const st = await getJson("/xtream/status");
      // accepte plusieurs formats possibles
      return (
        st?.account_id ||
        st?.acc_id ||
        st?.id ||
        st?.account?.id ||
        null
      );
    } catch { return null; }
  }

  function buildProxySrc(accId, knd, xtreamId) {
    if (!accId || !xtreamId) return null;
    if (String(knd).toLowerCase() === "live") {
      return `/api/stream/hls/${encodeURIComponent(accId)}/live/${encodeURIComponent(xtreamId)}.m3u8`;
    }
    // VOD/series → remux MP4 sûr (MKV compatible)
    return `/api/stream/vodmp4/${encodeURIComponent(accId)}/${encodeURIComponent(xtreamId)}`;
  }

  // -------- résolution serveur, pas de secrets en front --------
  async function startPlayback() {
    setPlaying(true);
    setResolvingSrc(true);
    setPlayErr("");
    setSrc("");

    try {
      // 1) chemin rapide si acc/xid déjà fournis
      const acc = accQS || (await getDefaultAccId());
      if (acc && xidQS) {
        const direct = buildProxySrc(acc, kind || "movie", xidQS);
        if (direct) { setSrc(direct); return; }
      }

      // 2) fallback: demande au serveur une URL proxy prête
      // Endpoint à implémenter côté API si pas déjà présent
      // Il doit renvoyer { src, accId?, xtreamId? } pour ce TMDB id
      const url = `/xtream/stream-url?kind=${encodeURIComponent(kind || "")}&id=${encodeURIComponent(id || "")}` +
                  (acc ? `&acc=${encodeURIComponent(acc)}` : "");
      const r = await getJson(url).catch(() => null);

      if (r?.src) {
        setSrc(r.src);
        return;
      }
      if (r?.accId && r?.xtreamId) {
        const s2 = buildProxySrc(r.accId, kind || "movie", r.xtreamId);
        if (s2) { setSrc(s2); return; }
      }

      throw new Error("no-src");
    } catch {
      setPlayErr(
        "Flux introuvable via le compte Xtream. Vérifie que le compte est lié et ajoute l’endpoint /xtream/stream-url côté API."
      );
    } finally {
      setResolvingSrc(false);
    }
  }

  // ---------- UI ----------
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

  const posterSrc = posterFromState || data.poster_url || data.backdrop_url || "";
  const title = titleFromState || data.title || "";

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* Lecteur in-page */}
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
              title={title}
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
        {/* Jaquette + overlay Play */}
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
              Note TMDB&nbsp;: {Number(data.vote_average).toFixed(1)}/10
            </div>
          )}
          {data.overview && (
            <p className="mt-4 leading-relaxed text-zinc-200">{data.overview}</p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              className="btn bg-emerald-600 text-white hover:bg-emerald-500"
              onClick={startPlayback}
            >
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
