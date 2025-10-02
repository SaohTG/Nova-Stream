// web/src/components/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import { postJson } from "../lib/api";
import SearchBar from "./SearchBar.jsx";

export default function Layout({ children }) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  async function onLogout() {
    try {
      localStorage.removeItem("access_token");
      await postJson("/auth/logout");
    } catch {}
    navigate("/login", { replace: true });
  }

  // close menu on route change (optional if you pass location as dep)
  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  const linkCls = ({ isActive }) =>
    `block rounded-lg px-3 py-2 text-sm transition ${
      isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white hover:bg-zinc-800/70"
    }`;

  return (
    <div className="min-h-screen bg-[radial-gradient(50%_60%_at_50%_0%,rgba(39,39,42,0.8),#0a0a0a)] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center gap-3">
          {/* Left: Logo + desktop nav */}
          <div className="flex items-center gap-3 md:gap-6">
            <Link to="/" className="text-xl font-bold tracking-tight">
              <span className="rounded bg-gradient-to-r from-indigo-500 to-violet-500 px-2 py-1">Nova</span>{" "}
              <span className="text-zinc-200">Stream</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-1">
              <NavLink to="/" className={linkCls} end>Accueil</NavLink>
              <NavLink to="/movies" className={linkCls}>Films</NavLink>
              <NavLink to="/series" className={linkCls}>Séries</NavLink>
              <NavLink to="/live" className={linkCls}>TV</NavLink>
              <NavLink to="/my-list" className={linkCls}>Ma Liste</NavLink>
              <NavLink to="/account" className={linkCls}>Compte</NavLink>
            </nav>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Desktop logout */}
          <button
            onClick={onLogout}
            className="hidden md:inline-flex rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            title="Se déconnecter"
          >
            Déconnexion
          </button>

          {/* Burger (mobile only) */}
          <button
            type="button"
            aria-label="Ouvrir le menu"
            aria-expanded={menuOpen ? "true" : "false"}
            onClick={() => setMenuOpen((v) => !v)}
            className="md:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/70 hover:bg-zinc-700/80 ring-1 ring-white/10"
          >
            <svg
              className={`h-5 w-5 transition-transform ${menuOpen ? "rotate-90" : ""}`}
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              {menuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <>
                  <path d="M3 6h18" />
                  <path d="M3 12h18" />
                  <path d="M3 18h18" />
                </>
              )}
            </svg>
          </button>
        </div>

        {/* Mobile slide-down menu (links + logout). Search N'EST PAS dans le menu. */}
        <div
          className={`md:hidden overflow-hidden transition-[max-height,opacity] duration-300 ${
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="px-4 pb-3 pt-2 grid gap-1 bg-black/60">
            <NavLink to="/" className={linkCls} end onClick={()=>setMenuOpen(false)}>Accueil</NavLink>
            <NavLink to="/movies" className={linkCls} onClick={()=>setMenuOpen(false)}>Films</NavLink>
            <NavLink to="/series" className={linkCls} onClick={()=>setMenuOpen(false)}>Séries</NavLink>
            <NavLink to="/live" className={linkCls} onClick={()=>setMenuOpen(false)}>TV</NavLink>
            <NavLink to="/my-list" className={linkCls} onClick={()=>setMenuOpen(false)}>Ma Liste</NavLink>
            <NavLink to="/account" className={linkCls} onClick={()=>setMenuOpen(false)}>Compte</NavLink>
            <button
              onClick={() => { setMenuOpen(false); onLogout(); }}
              className="mt-1 rounded-lg bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-700"
            >
              Déconnexion
            </button>
          </nav>
        </div>

        {/* Search visible partout, y compris mobile, hors menu */}
        <div className="w-full px-4 md:px-6 lg:px-8 pb-3 md:pb-0">
          <div className="md:hidden">
            <SearchBar />
          </div>
        </div>
      </header>

      {/* Desktop: search dans la barre du haut */}
      <div className="hidden md:block sticky top-[56px] z-30 bg-transparent px-4 md:px-6 lg:px-8 pt-3">
        <SearchBar />
      </div>

      <main className="w-full px-4 md:px-6 lg:px-8 pb-16">{children}</main>
    </div>
  );
}
