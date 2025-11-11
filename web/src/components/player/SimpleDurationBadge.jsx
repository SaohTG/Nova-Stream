// Composant simple qui affiche la durée sur n'importe quel lecteur
import { useEffect, useState } from 'react';

export default function SimpleDurationBadge({ videoRef }) {
  const [time, setTime] = useState({ current: 0, duration: 0 });

  useEffect(() => {
    const video = videoRef?.current;
    if (!video) return;

    const update = () => {
      setTime({
        current: video.currentTime || 0,
        duration: video.duration || 0
      });
    };

    video.addEventListener('timeupdate', update);
    video.addEventListener('loadedmetadata', update);
    video.addEventListener('durationchange', update);
    
    // Check initial
    update();
    
    // Vérifier toutes les secondes
    const interval = setInterval(update, 1000);

    return () => {
      video.removeEventListener('timeupdate', update);
      video.removeEventListener('loadedmetadata', update);
      video.removeEventListener('durationchange', update);
      clearInterval(interval);
    };
  }, [videoRef]);

  const formatTime = (seconds) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (!time.duration || time.duration === 0) return null;

  return (
    <div className="absolute top-4 right-4 z-50 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md text-white font-mono text-base shadow-2xl border border-white/20">
      <span className="tabular-nums font-semibold">{formatTime(time.current)}</span>
      <span className="text-zinc-400 mx-2">/</span>
      <span className="text-zinc-300 tabular-nums">{formatTime(time.duration)}</span>
    </div>
  );
}

