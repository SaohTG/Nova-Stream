// web/src/components/player/VideoPlayer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { postJson } from "../../lib/api";

function fmt(t){ if(!Number.isFinite(t)) return "--:--"; const s=Math.floor(t%60).toString().padStart(2,"0"); const m=Math.floor((t/60)%60).toString().padStart(2,"0"); const h=Math.floor(t/3600); return h?`${h}:${m}:${s}`:`${m}:${s}`; }

async function loadShakaOnce() {
  if (window.shaka) return window.shaka;
  await new Promise((res, rej) => {
    const existing = document.querySelector('script[data-shaka="1"]');
    if (existing) { existing.addEventListener('load', res); existing.addEventListener('error', rej); return; }
    const s = document.createElement("script");
    s.src = "/vendor/shaka-player.compiled.js";
    s.async = true;
    s.dataset.shaka = "1";
    s.onload = res;
    s.onerror = rej;
    document.head.appendChild(s);
  });
  return window.shaka;
}

const isHls = (u) => /\.m3u8(\?|$)/i.test(String(u));
const hlsToFile = (u) => String(u).replace(/\/hls\.m3u8(\?.*)?$/i, "/file$1");

export default function VideoPlayer({
  src,
  poster,
  title,
  resumeKey,
  resumeApi = true,
  startAt = 0,
  onEnded,
  showPoster = true, // ← nouveau
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [dur, setDur] = useState(NaN);
  const [t, setT] = useState(0);
  const [audios, setAudios] = useState([]);
  const [texts, setTexts] = useState([]);
  const [audioSel, setAudioSel] = useState({ lang: null, role: null });
  const [textSel, setTextSel] = useState({ lang: null, enabled: false });

  const [loading, setLoading] = useState(false);
  const [autoBlocked, setAutoBlocked] = useState(false);

  const lsKey = useMemo(() => (resumeKey ? `ns_watch_${resumeKey}` : null), [resumeKey]);
  const initialTime = useMemo(() => {
    if (!lsKey) return startAt || 0;
    try {
      const j = JSON.parse(localStorage.getItem(lsKey) || "{}");
      if (j && Number.isFinite(j.position) && Number.isFinite(j.duration) && j.duration > 60) {
        if (j.position > j.duration * 0.05 && j.position < j.duration * 0.95) return j.position;
      }
    } catch {}
    return startAt || 0;
  }, [lsKey, startAt]);

  const resolvedSrc = useMemo(() => (src || null), [src]);

  useEffect(() => { console.log("[Video src]", resolvedSrc); }, [resolvedSrc]);

  async function tryPlay(v) {
    v.muted = false;
    v.volume = 1;
    try {
      await v.play();
      setAutoBlocked(false);
    } catch {
      setAutoBlocked(true);
    }
  }

  useEffect(() => {
    let destroyed = false;

    const attachFile = (v, fileUrl) => {
      setLoading(true);
      v.src = fileUrl;
      const onMeta = () => {
        try {
          if (initialTime > 0 && Number.isFinite(v.duration)) {
            v.currentTime = Math.min(initialTime, Math.max(0, (v.duration || 1) - 1));
          }
        } catch {}
        tryPlay(v);
      };
      v.addEventListener("loadedmetadata", onMeta, { once: true });
    };

    (async () => {
      const v = videoRef.current;
      if (!v || !resolvedSrc) return;

      if (playerRef.current) {
        try { await playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      const onWaiting = () => setLoading(true);
      const onPlaying = () => setLoading(false);
      const onCanPlay = () => setLoading(false);
      v.addEventListener("waiting", onWaiting);
      v.addEventListener("playing", onPlaying);
      v.addEventListener("canplay", onCanPlay);

      if (isHls(resolvedSrc)) {
        try {
          setLoading(true);
          const shaka = await loadShakaOnce();
          shaka.polyfill.installAll?.();
          if (!shaka.Player.isBrowserSupported()) throw new Error("Shaka unsupported");

          const player = new shaka.Player();
          await player.attach(v);
          playerRef.current = player;

          const ne = player.getNetworkingEngine?.();
          if (ne && ne.registerRequestFilter) {
            ne.registerRequestFilter((_type, req) => { req.allowCrossSiteCredentials = true; });
          }

          player.addEventListener("error", (e) => console.error("[Shaka error]", e.detail));

          const refreshTracks = () => {
            const a = player.getAudioLanguagesAndRoles();
            const tks = player.getTextLanguages();
            setAudios(a.map(x => ({ lang: x.language, role: x.role || null, label: x.role ? `${x.language} • ${x.role}` : x.language })));
            setTexts(tks.map(l => ({ lang: l, kind: "sub", label: l })));
            const cfg = player.getConfiguration();
            setAudioSel({ lang: cfg.preferredAudioLanguage || null, role: cfg.preferredAudioRole || null });
            setTextSel(s => ({ ...s, lang: cfg.preferredTextLanguage || s.lang || null }));
          };
          player.addEventListener("trackschanged", refreshTracks);
          player.addEventListener("variantchanged", refreshTracks);
          player.addEventListener("textchanged", refreshTracks);

          await player.load(resolvedSrc, initialTime);
          if (destroyed) return;
          setDur(v.duration || NaN);
          refreshTracks();
          await tryPlay(v);
        } catch (e) {
          console.error("[Player/HLS]", e);
          try { await playerRef.current?.destroy(); } catch {}
          playerRef.current = null;
          attachFile(v, hlsToFile(resolvedSrc));
        }
      } else {
        attachFile(v, resolvedSrc);
      }

      return () => {
        v.removeEventListener("waiting", onWaiting);
        v.removeEventListener("playing", onPlaying);
        v.removeEventListener("canplay", onCanPlay);
      };
    })();

    return () => { destroyed = true; };
  }, [resolvedSrc, initialTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let lastPush = 0;
    const onTime = () => {
      setT(v.currentTime || 0);
      setDur(v.duration || dur);
      if (!lsKey) return;
      const now = Date.now();
      if (now - lastPush > 4000) {
        lastPush = now;
        const payload = { position: v.currentTime || 0, duration: v.duration || 0, title: title || null, src: resolvedSrc || src };
        try { localStorage.setItem(lsKey, JSON.stringify(payload)); } catch {}
        if (resumeApi && resumeKey) {
          postJson("/user/watch/progress", { key: resumeKey, position: payload.position, duration: payload.duration }).catch(() => {});
        }
      }
    };
    const onEndedCb = () => {
      if (resumeApi && resumeKey) postJson("/user/watch/progress", { key: resumeKey, position: dur, duration: dur }).catch(() => {});
      onEnded && onEnded();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onTime);
    v.addEventListener("ended", onEndedCb);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onTime);
      v.removeEventListener("ended", onEndedCb);
    };
  }, [lsKey, resumeApi, resumeKey, resolvedSrc, src, title, dur, onEnded]);

  const applyAudio = async (lang, role) => {
    const p = playerRef.current; if (!p) return;
    p.configure({ preferredAudioLanguage: lang || "", preferredAudioRole: role || "" });
    setAudioSel({ lang: lang || null, role: role || null });
  };
  const applyText = async (langOrOff) => {
    const p = playerRef.current; if (!p) return;
    if (!langOrOff) { p.setTextTrackVisibility(false); setTextSel({ lang: null, enabled: false }); }
    else { p.setTextTrackVisibility(true); p.selectTextLanguage(langOrOff); setTextSel({ lang: langOrOff, enabled: true }); }
  };

  return (
    <div className="relative w-full">
      <video
        ref={videoRef}
        className="w-full h-auto bg-black rounded-xl"
        poster={showPoster && poster ? poster : undefined} {/* ← conditionnel */}
        controls
        playsInline
        preload="metadata"
        crossOrigin="use-credentials"
      />
      {/* overlay chargement */}
      {loading && (
        <div className="absolute inset-0 grid place-items-center bg-black/40 pointer-events-none">
          <svg className="animate-spin h-10 w-10 text-white" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" opacity="0.25"/>
            <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" fill="none"/>
          </svg>
        </div>
      )}
      {/* overlay autoplay bloqué */}
      {autoBlocked && (
        <div className="absolute inset-0 grid place-items-center bg-black/50">
          <button
            className="px-4 py-2 text-sm rounded-full bg-white text-black"
            onClick={() => videoRef.current && videoRef.current.play().then(()=>setAutoBlocked(false)).catch(()=>{})}
          >
            Lire
          </button>
        </div>
      )}
      {/* sélecteurs */}
      <div className="absolute right-3 top-3 flex gap-2">
        <select
          className="rounded bg-black/60 text-white text-xs px-2 py-1"
          value={`${audioSel.lang || ""}||${audioSel.role || ""}`}
          onChange={(e) => { const [l, r] = e.target.value.split("||"); applyAudio(l || null, r || null); }}
          disabled={!playerRef.current}
        >
          <option value="||">Audio auto</option>
          {audios.map((a, i) => (<option key={`a-${i}`} value={`${a.lang || ""}||${a.role || ""}`}>{a.label}</option>))}
        </select>
        <select
          className="rounded bg-black/60 text-white text-xs px-2 py-1"
          value={textSel.enabled ? (textSel.lang || "") : ""}
          onChange={(e) => applyText(e.target.value || null)}
          disabled={!playerRef.current}
        >
          <option value="">Sous-titres désactivés</option>
          {texts.map((t, i) => (<option key={`t-${i}`} value={t.lang}>{t.label}</option>))}
        </select>
      </div>
      <div className="absolute left-3 bottom-3 text-[11px] rounded bg-black/50 text-white px-2 py-1">
        {fmt(t)} / {fmt(dur)}
      </div>
    </div>
  );
}
