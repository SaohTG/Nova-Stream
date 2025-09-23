import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import VideoPlayer from "../components/player/VideoPlayer.jsx";

export default function WatchPage() {
  const [sp] = useSearchParams();
  const initialSrc = sp.get("src") || "";
  const type = sp.get("type") || "movie";
  const id = sp.get("id") || "";
  const title = sp.get("title") || "";
  const poster = sp.get("poster") || "";
  const rk = sp.get("rk") || (id ? `${type}:${id}` : null);

  const [src, setSrc] = useState(initialSrc);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (src || !id) return;
    const base = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");
    const url = `${base}/media/stream?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}`;
    (async () => {
      try {
        const r = await fetch(url, { credentials: "include" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        const u = data.src || data.url || data.playlist || "";
        if (!u) throw new Error("src manquant dans la réponse");
        setSrc(u);
      } catch (e) {
        setErr(`Impossible de récupérer l’URL de lecture: ${e.message}`);
      }
    })();
  }, [src, id, type]);

  if (err) return <div className="p-4 text-red-500">{err}</div>;
  if (!src) return <div className="p-4">Préparation du lecteur…</div>;

  return (
    <div className="p-4">
      {title ? <h1 className="text-xl font-semibold mb-3">{title}</h1> : null}
      <VideoPlayer src={src} poster={poster || undefined} title={title || undefined} resumeKey={rk || undefined} />
    </div>
  );
}
