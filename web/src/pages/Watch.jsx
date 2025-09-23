// web/src/pages/Watch.jsx
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import VideoPlayer from "../components/player/VideoPlayer.jsx";
import { getJson } from "../lib/api";

export default function Watch() {
  const { kind, id } = useParams(); // "movie" | "series" | "live" (optionnel)
  const [qs] = useSearchParams();
  const nav = useNavigate();
  const loc = useLocation();

  // src via ?src=... prioritaire. Sinon fallback facultatif depuis API interne si présent.
  const srcQS = qs.get("src");
  const [src, setSrc] = useState(srcQS || "");
  const title = qs.get("title") || (loc.state && loc.state.title) || "";
  const poster = qs.get("poster") || (loc.state && loc.state.poster) || "";

  const resumeKey = useMemo(() => {
    if (!kind || !id) return null;
    // séries: accepter clé fournie via state (ex: "episode:SERIES:1:3")
    return (loc.state && loc.state.resumeKey) || `${kind}:${id}`;
  }, [kind, id, loc.state]);

  useEffect(() => {
    if (srcQS) return; // déjà fourni
    // essai optionnel: endpoint interne pour construire l'URL du flux si dispo côté API
    let alive = true;
    (async () => {
      try {
        const r = await getJson(`/xtream/stream-url?kind=${encodeURIComponent(kind || "")}&id=${encodeURIComponent(id || "")}`);
        if (!alive) return;
        if (r?.src) setSrc(r.src);
      } catch { /* silencieux */ }
    })();
    return () => { alive = false; };
  }, [kind, id, srcQS]);

  if (!src) {
    return (
      <div className="mx-auto max-w-xl p-4 text-center text-zinc-300">
        Source vidéo manquante.
        <div className="mt-2 text-sm text-zinc-400">Passez ?src=… dans l’URL ou exposez /xtream/stream-url.</div>
        <div className="mt-4"><button className="btn" onClick={() => nav(-1)}>Retour</button></div>
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
          // Hook “next up” à compléter: utilisez loc.state.nextHref si fourni
          const next = loc.state?.nextHref;
          if (next) nav(next, { replace: true });
        }}
      />
    </div>
  );
}
