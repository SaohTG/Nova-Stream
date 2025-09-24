// web/src/pages/Watch.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import VideoPlayer from "../components/player/VideoPlayer.jsx";
import { getJson } from "../lib/api";

function buildProxySrc(accId, kind, xtreamId) {
  if (!accId || !xtreamId) return null;
  if (String(kind).toLowerCase() === "live") {
    return `/api/stream/hls/${encodeURIComponent(accId)}/live/${encodeURIComponent(xtreamId)}.m3u8`;
  }
  // VOD par défaut via remux MP4 (sûr pour MKV)
  return `/api/stream/vodmp4/${encodeURIComponent(accId)}/${encodeURIComponent(xtreamId)}`;
}

export default function Watch() {
  const { kind, id } = useParams(); // "movie" | "series" | "live" (optionnel)
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();

  // Priorité aux paramètres explicites
  const srcQS = qs.get("src");
  const accQS = qs.get("acc") || loc.state?.accId || null;     // accountId
  const xidQS = qs.get("xid") || loc.state?.xtreamId || null;  // xtreamId (stream_id/vod_id/episode_id)

  const computedSrc = useMemo(() => {
    if (srcQS) return srcQS;
    return buildProxySrc(accQS, kind, xidQS);
  }, [srcQS, accQS, xidQS, kind]);

  const [src, setSrc] = useState(computedSrc || "");

  const title = qs.get("title") || loc.state?.title || "";
  const poster = qs.get("poster") || loc.state?.poster || "";

  const resumeKey = useMemo(() => {
    if (!kind || !id) return null;
    // séries: accepter clé fournie via state (ex: "episode:SERIES:1:3")
    return loc.state?.resumeKey || `${kind}:${id}`;
  }, [kind, id, loc.state]);

  // Si pas de src calculé, tentative de résolution côté API existante (/xtream/stream-url)
  useEffect(() => {
    setSrc(computedSrc || "");
  }, [computedSrc]);

  useEffect(() => {
    if (src) return; // déjà résolu
    let alive = true;
    (async () => {
      try {
        const url = `/xtream/stream-url?kind=${encodeURIComponent(kind || "")}&id=${encodeURIComponent(id || "")}` +
                    (accQS ? `&acc=${encodeURIComponent(accQS)}` : "");
        const r = await getJson(url);
        if (!alive) return;
        if (r?.src) setSrc(r.src);
      } catch {
        // silencieux
      }
    })();
    return () => { alive = false; };
  }, [src, kind, id, accQS]);

  if (!src) {
    return (
      <div className="mx-auto max-w-xl p-4 text-center text-zinc-300">
        Source vidéo manquante.
        <div className="mt-2 text-sm text-zinc-400">
          Passez un des formats suivants:
          <div className="mt-1">
            <code className="text-xs break-all">?src=&lt;URL&gt;</code>
          </div>
          <div className="mt-1">
            <code className="text-xs break-all">?acc=&lt;accountId&gt;&amp;xid=&lt;xtreamId&gt;</code>
          </div>
        </div>
        <div className="mt-4">
          <button className="btn" onClick={() => nav(-1)}>Retour</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-3 py-4">
      {title ? <h1 className="mb-3 text-lg font-semibold">{title}</h1> : null}
      <VideoPlayer
        src={src}
        poster={poster || undefined}
        title={title || undefined}
        resumeKey={resumeKey}
        resumeApi={true}
        onEnded={() => {
          const next = loc.state?.nextHref;
          if (next) nav(next, { replace: true });
        }}
      />
    </div>
  );
}
