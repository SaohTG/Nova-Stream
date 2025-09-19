import React from 'react'
export default function Nav(){
  return (
    <div className="nav">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-xl font-semibold">Nova <span className="text-white/60">Stream</span></div>
        <div className="flex gap-4 text-sm">
          <a href="#" className="hover:opacity-80">Accueil</a>
          <a href="#" className="hover:opacity-80">Films</a>
          <a href="#" className="hover:opacity-80">Séries</a>
          <a href="#" className="hover:opacity-80">TV</a>
          <a href="#" className="hover:opacity-80">Ma Liste</a>
        </div>
      </div>
    </div>
  )
}
