import React, { useEffect, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

export default function Player({ src }){
  const ref = useRef(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  
  useEffect(()=>{
    const video = ref.current
    if(!video) return
    
    // Event listeners pour mettre à jour les états
    const onTimeUpdate = () => setCurrentTime(video.currentTime || 0)
    const onLoadedMetadata = () => setDuration(video.duration || 0)
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('loadedmetadata', onLoadedMetadata)
    video.addEventListener('durationchange', onLoadedMetadata)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    
    if(Hls.isSupported() && src.endsWith('.m3u8')){
      const hls = new Hls()
      hls.loadSource(src)
      hls.attachMedia(video)
      return ()=>{
        hls.destroy()
        video.removeEventListener('timeupdate', onTimeUpdate)
        video.removeEventListener('loadedmetadata', onLoadedMetadata)
        video.removeEventListener('durationchange', onLoadedMetadata)
        video.removeEventListener('play', onPlay)
        video.removeEventListener('pause', onPause)
      }
    } else {
      video.src = src
    }
    
    return () => {
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('loadedmetadata', onLoadedMetadata)
      video.removeEventListener('durationchange', onLoadedMetadata)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
    }
  }, [src])
  
  const formatTime = useCallback((seconds) => {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);
  
  const handleSeek = useCallback((e) => {
    const video = ref.current;
    if (!video || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * duration;
    video.currentTime = Math.max(0, Math.min(time, duration));
  }, [duration]);
  
  return (
    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black group">
      <video 
        ref={ref} 
        controls 
        controlsList="nodownload"
        className="w-full h-full"
      />
      
      {/* Affichage du temps en overlay */}
      <div 
        className={`absolute top-4 right-4 px-3 py-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white font-mono text-sm shadow-lg transition-opacity ${
          showControls ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {formatTime(currentTime)} / {formatTime(duration)}
      </div>
    </div>
  )
}
