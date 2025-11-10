import React from "react";
import { Link, NavLink } from "react-router-dom";

const linkCls = ({ isActive }) =>
  `hover:opacity-80 ${isActive ? "text-white" : "text-white/80"}`;

export default function Nav() {
  return (
    <div className="nav sticky top-0 z-50 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="text-xl font-semibold">
          Lorna <span className="text-white/60">TV</span>
        </Link>

        {/* Liens */}
        <div className="flex items-center gap-4 text-sm">
          <NavLink to="/" className={linkCls} end>Accueil</NavLink>
          <NavLink to="/movies" className={linkCls}>Films</NavLink>
          <NavLink to="/series" className={linkCls}>Séries</NavLink>
          <NavLink to="/live" className={linkCls}>TV</NavLink>
          <NavLink to="/my-list" className={linkCls}>Ma Liste</NavLink>

          {/* Icône compte à droite */}
          <Link
            to="/compte"
            title="Compte"
            aria-label="Compte"
            className="ml-2 grid h-8 w-8 place-items-center rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/>
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
