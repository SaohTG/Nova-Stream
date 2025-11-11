// web/src/components/player/VideoPlayer.jsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { postJson } from "../../lib/api";

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

const VideoPlayer = React.memo(function VideoPlayer({
  src,
  poster,
  title,
  resumeKey,
  resumeApi = true,
  startAt = 0,
  onEnded,
  showPoster = true,
}) {
  const videoRef = useRef(null);
  const playerRef = useRef(null);
  const [audios, setAudios] = useState([]);
  const [texts, setTexts] = useState([]);
  const [audioSel, setAudioSel] = useState({ lang: null, role: null });
  const [textSel, setTextSel] = useState({ lang: null, enabled: false });
  const [autoBlocked, setAutoBlocked] = useState(false);
  
  // États pour les contrôles personnalisés
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSeeking, setIsSeeking] = useState(false);
  const controlsTimeout = useRef(null);

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

  async function tryPlay(v) {
    v.muted = false;
    v.volume = 1;
    try { await v.play(); setAutoBlocked(false); } catch { setAutoBlocked(true); }
  }

  useEffect(() => {
    let destroyed = false;

    const attachFile = (v, fileUrl) => {
      v.preload = "metadata";
      v.src = fileUrl;

      const onCanPlay = () => {
        try {
          if (initialTime > 5 && Number.isFinite(v.duration)) {
            v.currentTime = Math.min(initialTime, Math.max(0, (v.duration || 1) - 1));
          }
        } catch {}
        tryPlay(v);
      };

      v.addEventListener("canplay", onCanPlay, { once: true });
    };

    (async () => {
      const v = videoRef.current;
      if (!v || !resolvedSrc) return;

      if (playerRef.current) {
        try { await playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }

      const isLiveSrc = /\/api\/media\/live\//i.test(resolvedSrc);
      const isVodSrc  = /\/api\/media\/(movie|series)\//i.test(resolvedSrc);

      if (isVodSrc) {
        const fileUrl = isHls(resolvedSrc) ? hlsToFile(resolvedSrc) : resolvedSrc;
        attachFile(v, fileUrl);
      } else if (isLiveSrc && isHls(resolvedSrc)) {
        try {
          const shaka = await loadShakaOnce();
          shaka.polyfill.installAll?.();
          if (!shaka.Player.isBrowserSupported()) throw new Error("Shaka unsupported");

          const player = new shaka.Player();
          await player.attach(v);
          playerRef.current = player;

          player.configure({
            streaming: { bufferingGoal: 2, rebufferingGoal: 1.5, bufferBehind: 30 },
            abr: { defaultBandwidthEstimate: 5_000_000 }
          });

          const ne = player.getNetworkingEngine?.();
          if (ne?.registerRequestFilter) {
            ne.registerRequestFilter((_t, req) => { req.allowCrossSiteCredentials = true; });
          }

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

          await player.load(resolvedSrc, initialTime > 5 ? initialTime : 0);
          if (destroyed) return;
          refreshTracks();
          await tryPlay(v);
        } catch (e) {
          console.error("[Player/HLS]", e);
          try { await playerRef.current?.destroy(); } catch {}
          playerRef.current = null;
        }
      } else {
        attachFile(v, resolvedSrc);
      }
    })();

    return () => { 
      destroyed = true;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, [resolvedSrc, initialTime]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let lastPush = 0;
    
    const onTime = () => {
      if (!v) return;
      setCurrentTime(v.currentTime || 0);
      // Mettre à jour la durée à chaque timeupdate si elle n'était pas disponible avant
      if (v.duration && v.duration > 0) {
        setDuration(v.duration);
      }
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
    
    const onLoadedMetadata = () => {
      if (!v) return;
      console.log('[VideoPlayer] Duration loaded:', v.duration);
      if (v.duration && isFinite(v.duration)) {
        setDuration(v.duration);
      }
    };
    
    const onCanPlay = () => {
      if (!v) return;
      // Certaines vidéos ont la durée disponible seulement après canplay
      if (v.duration && v.duration > 0 && isFinite(v.duration)) {
        console.log('[VideoPlayer] Duration from canplay:', v.duration);
        setDuration(v.duration);
      }
    };
    
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    
    const onEndedCb = () => {
      setIsPlaying(false);
      if (v && resumeApi && resumeKey) {
        postJson("/user/watch/progress", { key: resumeKey, position: v.duration || 0, duration: v.duration || 0 }).catch(() => {});
      }
      if (onEnded) onEnded();
    };
    
    const onVolumeChange = () => {
      if (!v) return;
      setVolume(v.volume);
      setIsMuted(v.muted);
    };
    
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onLoadedMetadata);
    v.addEventListener("durationchange", onLoadedMetadata);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("canplaythrough", onCanPlay);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEndedCb);
    v.addEventListener("volumechange", onVolumeChange);
    
    // Initialiser les valeurs immédiatement si disponibles
    if (v.duration && v.duration > 0) {
      console.log('[VideoPlayer] Initial duration:', v.duration);
      setDuration(v.duration);
    }
    setCurrentTime(v.currentTime || 0);
    setVolume(v.volume);
    setIsMuted(v.muted);
    setIsPlaying(!v.paused);
    
    // Vérifier la durée périodiquement pour les streams (seulement si nécessaire)
    const durationCheckInterval = setInterval(() => {
      if (!v || !v.duration) return;
      if (v.duration > 0 && isFinite(v.duration)) {
        setDuration(v.duration);
      }
    }, 2000);
    
    return () => {
      if (durationCheckInterval) clearInterval(durationCheckInterval);
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
      if (!v) return;
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onLoadedMetadata);
      v.removeEventListener("durationchange", onLoadedMetadata);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("canplaythrough", onCanPlay);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEndedCb);
      v.removeEventListener("volumechange", onVolumeChange);
    };
  }, [lsKey, resumeApi, resumeKey, resolvedSrc, src, title, onEnded]);

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

  // Fonctions de contrôle vidéo
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, []);

  const handleSeek = useCallback((e) => {
    const v = videoRef.current;
    if (!v || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    v.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);

  const handleVolumeChange = useCallback((newVolume) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = newVolume;
    setVolume(newVolume);
    if (newVolume === 0) {
      v.muted = true;
      setIsMuted(true);
    } else if (isMuted) {
      v.muted = false;
      setIsMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setIsMuted(v.muted);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const container = videoRef.current?.parentElement;
    if (!container) return;
    if (!document.fullscreenElement) {
      container.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }, []);

  const formatTime = useCallback((seconds) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    if (seconds === 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);
  
  const isLiveStream = !isFinite(duration) || duration === 0;

  const showControlsTemporarily = useCallback(() => {
    setShowControls(true);
    if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    controlsTimeout.current = setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  }, [isPlaying]);

  // Gérer l'état fullscreen
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      // Sortir du plein écran si on quitte la page
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, []);

  // Afficher les contrôles quand la vidéo est en pause
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      if (controlsTimeout.current) clearTimeout(controlsTimeout.current);
    }
  }, [isPlaying]);
  
  // Cleanup général au démontage du composant
  useEffect(() => {
    return () => {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
        controlsTimeout.current = null;
      }
    };
  }, []);

  return (
    <div 
      className="relative w-full h-full bg-black rounded-xl overflow-hidden group"
      onMouseMove={showControlsTemporarily}
      onMouseEnter={() => setShowControls(true)}
    >
      <video
        ref={videoRef}
        className="w-full h-full bg-black cursor-pointer"
        poster={showPoster && poster ? poster : undefined}
        playsInline
        preload="metadata"
        crossOrigin="use-credentials"
        onClick={togglePlay}
      />
      
      {/* Overlay de lecture automatique bloquée */}
      {autoBlocked && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 backdrop-blur-sm z-50">
          <button
            className="px-8 py-4 text-lg rounded-xl bg-white text-black font-semibold shadow-2xl hover:scale-105 transition-transform flex items-center gap-2"
            onClick={() => videoRef.current && videoRef.current.play().then(()=>setAutoBlocked(false)).catch(()=>{})}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
            Lire la vidéo
          </button>
        </div>
      )}
      
      {/* Badge durée permanent (toujours visible) */}
      {!isLiveStream && duration > 0 && (
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/80 backdrop-blur-sm text-white font-mono text-sm shadow-lg border border-white/20 z-40">
          <span className="tabular-nums">{formatTime(currentTime)}</span>
          <span className="text-zinc-400 mx-1">/</span>
          <span className="text-zinc-300 tabular-nums">{formatTime(duration)}</span>
        </div>
      )}
      
      {/* Badge DIRECT pour les streams live */}
      {isLiveStream && (
        <div className="absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-red-500/90 backdrop-blur-sm text-white text-sm font-semibold shadow-lg flex items-center gap-2 z-40">
          <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
          EN DIRECT
        </div>
      )}
      
      {/* Icône Play/Pause centrée au clic */}
      {!autoBlocked && (
        <div 
          className="absolute inset-0 grid place-items-center pointer-events-none z-30"
          onClick={togglePlay}
        >
          <div className={`w-20 h-20 flex items-center justify-center rounded-full bg-black/50 backdrop-blur-sm transition-all duration-300 ${
            isPlaying ? 'opacity-0 scale-75' : 'opacity-0 group-hover:opacity-100 scale-100'
          }`}>
            <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
            </svg>
          </div>
        </div>
      )}
      
      {/* Contrôles personnalisés */}
      <div 
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/80 to-transparent transition-all duration-300 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Timeline cliquable (seulement pour VOD, pas pour live) */}
        {!isLiveStream && (
          <div className="px-6 pt-8 pb-3">
            <div 
              className="relative h-1.5 bg-white/20 rounded-full cursor-pointer group/timeline hover:h-2 transition-all"
              onClick={handleSeek}
              onMouseDown={(e) => {
                setIsSeeking(true);
                handleSeek(e);
              }}
              onMouseMove={(e) => {
                if (isSeeking) handleSeek(e);
              }}
              onMouseUp={() => setIsSeeking(false)}
              onMouseLeave={() => setIsSeeking(false)}
            >
            {/* Barre de progression */}
            <div 
              className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all shadow-glow"
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            />
            {/* Curseur */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg opacity-0 group-hover/timeline:opacity-100 transition-opacity border-2 border-primary-500"
              style={{ left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`, transform: 'translate(-50%, -50%)' }}
            />
          </div>
          
          {/* Temps actuel / Durée totale */}
          <div className="flex items-center justify-between mt-3 text-sm text-white font-medium">
            <span className="font-mono text-base tabular-nums">{formatTime(currentTime)}</span>
            {!isLiveStream ? (
              <span className="text-zinc-300 font-mono tabular-nums">{formatTime(duration)}</span>
            ) : (
              <span className="text-red-500 font-medium flex items-center gap-1">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                DIRECT
              </span>
            )}
          </div>
        </div>
        )}
        
        {/* Boutons de contrôle */}
        <div className="px-6 pb-5 flex items-center justify-between gap-4">
          {/* Gauche: Lecture + Volume */}
          <div className="flex items-center gap-4">
            {/* Bouton Play/Pause */}
            <button
              onClick={togglePlay}
              className="w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hover:scale-110"
              aria-label={isPlaying ? "Pause" : "Lecture"}
            >
              {isPlaying ? (
                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 4a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V4zM13 4a2 2 0 012-2h2a2 2 0 012 2v12a2 2 0 01-2 2h-2a2 2 0 01-2-2V4z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-white ml-1" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" />
                </svg>
              )}
            </button>
            
            {/* Volume */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={toggleMute}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                aria-label={isMuted ? "Activer le son" : "Couper le son"}
              >
                {isMuted || volume === 0 ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                ) : volume > 0.5 ? (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0 1 1 0 010 1.414L11.414 10l.879.879a1 1 0 11-1.414 1.414l-2-2a1 1 0 010-1.414l2-2z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                className="w-24 h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-lg [&::-moz-range-thumb]:cursor-pointer"
                style={{
                  background: `linear-gradient(to right, white ${volume * 100}%, rgba(255,255,255,0.2) ${volume * 100}%)`
                }}
              />
            </div>
          </div>
          
          {/* Droite: Audio/Sous-titres + Plein écran */}
          <div className="flex items-center gap-2">
            {/* Audio */}
            {audios.length > 0 && (
              <select
                className="rounded-lg bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-2 border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                value={`${audioSel.lang || ""}||${audioSel.role || ""}`}
                onChange={(e) => { const [l, r] = e.target.value.split("||"); applyAudio(l || null, r || null); }}
                disabled={!playerRef.current}
              >
                <option value="||">🔊 Audio auto</option>
                {audios.map((a, i) => (<option key={`a-${i}`} value={`${a.lang || ""}||${a.role || ""}`}>🔊 {a.label}</option>))}
              </select>
            )}
            
            {/* Sous-titres */}
            {texts.length > 0 && (
              <select
                className="rounded-lg bg-white/10 backdrop-blur-sm text-white text-sm px-3 py-2 border border-white/20 hover:bg-white/20 transition-colors cursor-pointer"
                value={textSel.enabled ? (textSel.lang || "") : ""}
                onChange={(e) => applyText(e.target.value || null)}
                disabled={!playerRef.current}
              >
                <option value="">💬 Sous-titres off</option>
                {texts.map((t, i) => (<option key={`t-${i}`} value={t.lang}>💬 {t.label}</option>))}
              </select>
            )}
            
            {/* Plein écran */}
            <button
              onClick={toggleFullscreen}
              className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all hover:scale-110"
              aria-label="Plein écran"
            >
              {isFullscreen ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});

export default VideoPlayer;
