// web/src/components/player/VideoPlayer.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import shaka from "shaka-player/dist/shaka-player.compiled.js";
import { postJson } from "../../lib/api";

function fmt(t) {
  if (!Number.isFinite(t)) return "--:--";
  const s = Math.floor(t % 60).toString().padStart(2, "0");
  const m = Math.floor((t / 60) % 60).toString().padStart(2, "0");
  const h = Math.floor(t / 3600);
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

export default function VideoPlayer({
  src,                 // URL HLS (.m3u8) ou DASH (.mpd)
  poster,              // optionnel
  title,               // optionnel
  resumeKey,           // ex: `movie:123` ou `episode:SERIESID:S:E`
  resumeApi = true,    // push serveur
  startAt = 0,         // secondes si pas de reprise trouvée
  onEnded,             // callback fin
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [dur, setDur] = useState(NaN);
  const [t, setT] = useState(0);
  const [audios, setAudios] = useState([]);      // [{lang,role,label}]
  const [texts, setTexts]   = useState([]);      // [{lang,kind,label}]
  const [audioSel, setAudioSel] = useState({ lang: null, role: null });
  const [textSel, setTextSel]   = useState({ lang: null, enabled: false });

  const lsKey = useMemo(() => resumeKey ? `ns_watch_${resumeKey}` : null, [resumeKey]);

  // Charger reprise locale
  const initialTime = useMemo(() => {
    if (!lsKey) return startAt || 0;
    try {
      const j = JSON.parse(localStorage.getItem(lsKey) || "{}");
      if (j && Number.isFinite(j.position) && Number.isFinite(j.duration) && j.duration > 60) {
        // Reprendre si > 5% et < 95%
        if (j.position > j.duration * 0.05 && j.position < j.duration * 0.95) return j.position;
      }
    } catch {}
    return startAt || 0;
  }, [lsKey, startAt]);

  // Init Shaka
  useEffect(() => {
    let mounted = true;
    async function boot() {
      if (!videoRef.current || !src) return;
      try {
        shaka.polyfill.installAll();
        if (!shaka.Player.isBrowserSupported()) throw new Error("Shaka unsupported");
        const player = new shaka.Player(videoRef.current);
        playerRef.current = player;

        // Tracks → états
        const refreshTracks = () => {
          const a = player.getAudioLanguagesAndRoles(); // [{language,role}]
          const tks = player.getTextLanguages();        // ["fr","en",...]
          setAudios(a.map(x => ({ lang: x.language, role: x.role || null, label: x.role ? `${x.language} • ${x.role}` : x.language })));
          setTexts(tks.map(l => ({ lang: l, kind: "sub", label: l })));
          // valeurs courantes
          const al = player.getConfiguration().preferredAudioLanguage || null;
          const ar = player.getConfiguration().preferredAudioRole || null;
          const tl = player.getConfiguration().preferredTextLanguage || null;
          setAudioSel({ lang: al, role: ar || null });
          setTextSel(s => ({ ...s, lang: tl || s.lang || null }));
        };

        player.addEventListener("trackschanged", refreshTracks);
        player.addEventListener("variantchanged", refreshTracks);
        player.addEventListener("textchanged", refreshTracks);

        await player.load(src, initialTime);
        setDur(videoRef.current.duration || NaN);
        refreshTracks();
        setReady(true);
      } catch (e) {
        console.error("[Player]", e);
      }
    }
    boot();
    return () => {
      mounted = false;
      const p = playerRef.current;
      playerRef.current = null;
      if (p) p.destroy();
    };
  }, [src, initialTime]);

  // timeupdate + sauvegarde périodique
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
        const payload = { position: v.currentTime || 0, duration: v.duration || 0, title: title || null, src };
        try { localStorage.setItem(lsKey, JSON.stringify(payload)); } catch {}
        if (resumeApi && resumeKey) {
          // best-effort, non bloquant
          postJson("/user/watch/progress", {
            key: resumeKey, position: payload.position, duration: payload.duration
          }).catch(() => {});
        }
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("pause", onTime);
    v.addEventListener("ended", () => {
      if (resumeApi && resumeKey) {
        postJson("/user/watch/progress", { key: resumeKey, position: dur, duration: dur }).catch(() => {});
      }
      onEnded && onEnded();
    });
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("pause", onTime);
    };
  }, [lsKey, resumeApi, resumeKey, src, title, dur, onEnded]);

  // sélections
  const applyAudio = async (lang, role) => {
    const p = playerRef.current; if (!p) return;
    const cfg = { preferredAudioLanguage: lang || "", preferredAudioRole: role || "" };
    p.configure(cfg);
    setAudioSel({ lang: lang || null, role: role || null });
  };
  const applyText = async (langOrOff) => {
    const p = playerRef.current; if (!p) return;
    if (!langOrOff) {
      p.setTextTrackVisibility(false);
      setTextSel({ lang: null, enabled: false });
    } else {
      p.setTextTrackVisibility(true);
      p.selectTextLanguage(langOrOff);
      setTextSel({ lang: langOrOff, enabled: true });
    }
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
      />
      {/* overlay simple: sélecteurs audio / sous-titres */}
      <div className="absolute right-3 top-3 flex gap-2">
        {/* Audio */}
        <select
          className="rounded bg-black/60 text-white text-xs px-2 py-1"
          value={`${audioSel.lang || ""}||${audioSel.role || ""}`}
          onChange={(e) => {
            const [l, r] = e.target.value.split("||");
            applyAudio(l || null, r || null);
          }}
        >
          <option value="||">Audio auto</option>
          {audios.map((a, i) => (
            <option key={`a-${i}`} value={`${a.lang || ""}||${a.role || ""}`}>
              {a.label}
            </option>
          ))}
        </select>

        {/* Subtitles */}
        <select
          className="rounded bg-black/60 text-white text-xs px-2 py-1"
          value={textSel.enabled ? (textSel.lang || "") : ""}
          onChange={(e) => applyText(e.target.value || null)}
        >
          <option value="">Sous-titres désactivés</option>
          {texts.map((t, i) => (
            <option key={`t-${i}`} value={t.lang}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* barre de temps simple */}
      <div className="absolute left-3 bottom-3 text-[11px] rounded bg-black/50 text-white px-2 py-1">
        {fmt(t)} / {fmt(dur)}
      </div>
    </div>
  );
}
