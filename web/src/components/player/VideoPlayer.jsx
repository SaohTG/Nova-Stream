// web/src/components/player/VideoPlayer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { postJson } from "../../lib/api";

function fmt(t){ if(!Number.isFinite(t)) return "--:--"; const s=Math.floor(t%60).toString().padStart(2,"0"); const m=Math.floor((t/60)%60).toString().padStart(2,"0"); const h=Math.floor(t/3600); return h?`${h}:${m}:${s}`:`${m}:${s}`; }

/* -------- HLS loader (Shaka) -------- */
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

/* -------- Helpers -------- */
const isHls = (u) => /\.m3u8(\?|$)/i.test(String(u));

/** Mappe une URL Xtream (movie|series) -> proxy API sécurisé.
 *  - MKV (ou autre) -> remux MP4 via /api/stream/vodmp4
 *  - MP4 -> passthrough via /api/stream/vod?ext=mp4
 *  - Autres URLs non-Xtream → inchangées
 */
function mapXtreamVodToProxy(src) {
  try {
    const url = new URL(src, window.location.origin);
    const m = url.pathname.match(/^\/(movie|series)\/([^/]+)\/([^/]+)\/([^/.]+)\.([a-z0-9]+)$/i);
    if (!m) return null;
    const user = decodeURIComponent(m[2]);
    const pass = decodeURIComponent(m[3]);
    const id   = decodeURIComponent(m[4]);
    const ext  = m[5].toLowerCase();
    if (ext === "mp4") {
      return `/api/stream/vod/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}?ext=mp4`;
    }
    // défaut: remux en MP4 pour MKV et co.
    return `/api/stream/vodmp4/${encodeURIComponent(user)}/${encodeURIComponent(pass)}/${encodeURIComponent(id)}`;
  } catch { return null; }
}

export default function VideoPlayer({
  src, poster, title, resumeKey, resumeApi = true, startAt = 0, onEnded,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [dur, setDur] = useState(NaN);
  const [t, setT] = useState(0);
  const [audios, setAudios] = useState([]);
  const [texts, setTexts] = useState([]);
  const [audioSel, setAudioSel] = useState({ lang: null, role: null });
  const [textSel, setTextSel] = useState({ lang: null, enabled: false });

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

  // Résolution de la source: HLS inchangé. VOD Xtream -> proxy API.
  const resolvedSrc = useMemo(() => {
    if (!src) return null;
    if (isHls(src)) return src;
    const proxied = mapXtreamVodToProxy(src);
    return proxied || src; // si pas Xtream, on laisse tel quel
  }, [src]);

  // Debug source
  useEffect(() => {
    console.log("[Video src]", resolvedSrc);
  }, [resolvedSrc]);

  // Chargement selon le type: HLS via Shaka, sinon <video src=...>
  useEffect(() => {
    let destroyed = false;

    (async () => {
      const v = videoRef.current;
      if (!v || !resolvedSrc) return;

      // Nettoie un éventuel lecteur Shaka existant
      if (playerRef.current) {
        try { await playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      if (isHls(resolvedSrc)) {
        try {
          const shaka = await loadShakaOnce();
          shaka.polyfill.installAll?.();
          if (!shaka.Player.isBrowserSupported()) throw new Error("Shaka unsupported");
          const player = new shaka.Player(v);
          playerRef.current = player;

          // Inclure les cookies sur les requêtes /api/... (même origine)
          const ne = player.getNetworkingEngine?.();
          if (ne && ne.registerRequestFilter) {
            ne.registerRequestFilter((_type, req) => {
              try {
                const uri = (req.uris && req.uris[0]) || "";
                if (uri.startsWith("/") || uri.startsWith(window.location.origin)) {
                  req.allowCrossSiteCredentials = true;
                }
              } catch {}
            });
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
          v.play?.().catch(()=>{});
        } catch (e) {
          console.error("[Player/HLS]", e);
        }
      } else {
        // VOD MP4 (via proxy) ou autre source directe
        v.src = resolvedSrc;
        const onMeta = () => {
          try { if (initialTime > 0 && Number.isFinite(v.duration)) v.currentTime = Math.min(initialTime, v.duration - 1); } catch {}
          v.play?.().catch(()=>{});
        };
        v.addEventListener("loadedmetadata", onMeta, { once: true });
      }
    })();

    return () => { destroyed = true; };
  }, [resolvedSrc, initialTime]);

  // Progress save + fin
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
        poster={poster}
        controls
        playsInline
        preload="metadata"
        crossOrigin="use-credentials"
      />
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
