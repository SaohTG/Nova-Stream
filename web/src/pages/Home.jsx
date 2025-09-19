import React, { useEffect, useState } from 'react'
import api from '../api'
import Nav from '../components/Nav'
import Player from '../components/Player'

export default function Home({ userId }){
  const [creds,setCreds]=useState(null)
  const [movies,setMovies]=useState([])
  const [selected,setSelected]=useState(null)
  const [stream,setStream]=useState(null)
  const [tmdb,setTmdb]=useState(null)

  useEffect(()=>{
    async function run(){
      const { data } = await api.get('/user/xtream-credentials', { params: { user_id: userId } })
      setCreds(data)
      const m = await api.post('/xtream/movies', data)
      setMovies(m.data||[])
    }
    run().catch(()=>{})
  },[])

  async function openDetail(item){
    setSelected(item)
    setStream(null)
    setTmdb(null)
    // TMDB overview only (best-effort by name)
    try{
      const q = item.name || item.title
      const sr = await api.get('/tmdb/search', { params: { q, type:'movie', language:'fr-FR' } })
      const first = sr.data?.results?.[0]
      if(first){
        const d = await api.get('/tmdb/detail', { params: { id: first.id, type:'movie', language:'fr-FR' } })
        setTmdb(d.data)
      }
    }catch{}
  }

  async function play(item){
    const { data } = await api.post('/xtream/stream-url', { ...creds, stream_id: item.stream_id, ext: 'm3u8' })
    setStream(data.url)
  }

  return (
    <div>
      <Nav/>
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-8">
        <h1 className="text-3xl font-semibold">Accueil</h1>
        {!creds ? <div className="skel h-24"/> : (
          <div className="grid-posters">
            {(movies||[]).slice(0,24).map(m=>(
              <button key={m.stream_id} className="card hover:ring-2 ring-white/20 transition" onClick={()=>openDetail(m)}>
                {/* image from Xtream only */}
                <img src={m.stream_icon||m.cover||m.movie_image} alt={m.name} className="w-full aspect-[2/3] object-cover" />
                <div className="p-2 text-left text-sm">{m.name}</div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="card p-4 space-y-4">
            <div className="flex flex-col md:flex-row gap-4">
              <img src={selected.stream_icon||selected.cover||selected.movie_image} alt={selected.name} className="w-48 rounded-xl object-cover" />
              <div className="flex-1 space-y-2">
                <h2 className="text-2xl font-semibold">{selected.name}</h2>
                <p className="text-white/70 text-sm">{tmdb?.overview||'Aucune description disponible.'}</p>
                <button className="btn" onClick={()=>play(selected)}>Regarder</button>
              </div>
            </div>
            {stream && <Player src={stream}/>}
          </div>
        )}
      </div>
    </div>
  )
}
