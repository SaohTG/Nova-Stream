import React, { useEffect, useRef } from 'react'
import Hls from 'hls.js'

export default function Player({ src }){
  const ref = useRef(null)
  useEffect(()=>{
    const video = ref.current
    if(!video) return
    if(Hls.isSupported() && src.endsWith('.m3u8')){
      const hls = new Hls()
      hls.loadSource(src)
      hls.attachMedia(video)
      return ()=>hls.destroy()
    } else {
      video.src = src
    }
  }, [src])
  return (
    <div className="aspect-video w-full rounded-2xl overflow-hidden bg-black">
      <video ref={ref} controls className="w-full h-full" />
    </div>
  )
}
