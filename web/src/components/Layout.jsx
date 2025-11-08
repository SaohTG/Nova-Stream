// web/src/components/Layout.jsx
import { useState, useEffect } from "react";
import { NavLink, useNavigate, Link } from "react-router-dom";
import { postJson } from "../lib/api";
import SearchBar from "./SearchBar.jsx";

function AccountIcon({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M4 20a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  );
}

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

  useEffect(() => {
    const close = () => setMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  const linkCls = ({ isActive }) =>
    `relative block rounded-xl px-3 py-2 text-sm font-medium transition-all duration-300 ${
      isActive 
        ? "bg-gradient-to-r from-primary-600/20 to-accent-600/20 text-white shadow-lg border border-primary-500/30" 
        : "text-zinc-300 hover:text-white hover:bg-white/10 hover:scale-105"
    }`;

  return (
    <div className="min-h-screen text-white relative">
      {/* Arrière-plan animé moderne */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,0.15),transparent_50%),radial-gradient(circle_at_70%_80%,rgba(217,70,239,0.15),transparent_50%)]"></div>
      <div className="fixed inset-0 -z-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0icmdiYSgyNTUsMjU1LDI1NSwwLjAzKSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9wYXR0ZXJuPjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2dyaWQpIi8+PC9zdmc+')] opacity-30"></div>

      <header className="nav animate-slide-down">
        {/* Header row */}
        <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center gap-3">
          {/* Left: logo + desktop nav */}
          <div className="flex items-center gap-3 md:gap-6">
            <Link to="/" className="text-xl font-bold tracking-tight group">
              <span className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-3 py-1.5 transition-all duration-300 group-hover:shadow-glow group-hover:scale-105">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                </svg>
                Nova
              </span>{" "}
              <span className="text-zinc-100 group-hover:text-white transition-colors">Stream</span>
            </Link>

            {/* Desktop nav */}
            <nav className="hidden md:flex gap-2">
              <NavLink to="/" className={linkCls} end>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
                  </svg>
                  Accueil
                </span>
              </NavLink>
              <NavLink to="/movies" className={linkCls}>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" clipRule="evenodd" />
                  </svg>
                  Films
                </span>
              </NavLink>
              <NavLink to="/series" className={linkCls}>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                  </svg>
                  Séries
                </span>
              </NavLink>
              <NavLink to="/live" className={linkCls}>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  TV
                </span>
              </NavLink>
              <NavLink to="/my-list" className={linkCls}>
                <span className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v14l-5-2.5L5 18V4z" />
                  </svg>
                  Ma Liste
                </span>
              </NavLink>
            </nav>
          </div>

          {/* Search: in-header on desktop */}
          <div className="hidden md:flex flex-1 px-2">
            <SearchBar />
          </div>

          {/* Right controls */}
          <div className="ml-auto flex items-center gap-2">
            {/* Icône Compte → /account */}
            <NavLink
              to="/account"
              onClick={() => setMenuOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-zinc-800/80 to-zinc-900/80 ring-1 ring-white/20 hover:ring-primary-500/50 hover:shadow-glow text-white transition-all duration-300 hover:scale-110"
              title="Compte"
              aria-label="Compte"
            >
              <AccountIcon className="h-5 w-5" />
            </NavLink>

            {/* Desktop logout */}
            <button
              onClick={onLogout}
              className="hidden md:inline-flex items-center gap-1.5 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 px-4 py-1.5 text-sm text-zinc-200 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-300"
              title="Se déconnecter"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Déconnexion
            </button>

            {/* Burger (mobile only) */}
            <button
              type="button"
              aria-label="Ouvrir le menu"
              aria-expanded={menuOpen ? "true" : "false"}
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 backdrop-blur-sm hover:bg-white/10 ring-1 ring-white/20 transition-all duration-300 hover:scale-110"
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
        </div>

        {/* Mobile slide menu: links + logout (search remains outside) */}
        <div
          className={`md:hidden overflow-hidden transition-all duration-300 ${
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <nav className="px-4 pb-3 pt-2 grid gap-2 bg-black/80 backdrop-blur-xl border-t border-white/5">
            <NavLink to="/" className={linkCls} end onClick={()=>setMenuOpen(false)}>Accueil</NavLink>
            <NavLink to="/movies" className={linkCls} onClick={()=>setMenuOpen(false)}>Films</NavLink>
            <NavLink to="/series" className={linkCls} onClick={()=>setMenuOpen(false)}>Séries</NavLink>
            <NavLink to="/live" className={linkCls} onClick={()=>setMenuOpen(false)}>TV</NavLink>
            <NavLink to="/my-list" className={linkCls} onClick={()=>setMenuOpen(false)}>Ma Liste</NavLink>
            <button
              onClick={() => { setMenuOpen(false); onLogout(); }}
              className="mt-1 flex items-center gap-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 px-3 py-2 text-left text-sm text-zinc-200 hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-300"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Déconnexion
            </button>
          </nav>
        </div>

        {/* Mobile search: below header only on small screens */}
        <div className="w-full px-4 md:px-6 lg:px-8 pb-3 md:hidden">
          <SearchBar />
        </div>
      </header>

      <main className="w-full px-4 md:px-6 lg:px-8 pb-16 animate-fade-in">{children}</main>
    </div>
  );
}
