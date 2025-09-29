// web/src/components/Layout.jsx
import { NavLink, useNavigate, Link } from "react-router-dom";
import { postJson } from "../lib/api";
import SearchBar from "./SearchBar.jsx";

export default function Layout({ children }) {
  const navigate = useNavigate();

  async function onLogout() {
    try {
      localStorage.removeItem("access_token");
      await postJson("/auth/logout");
    } catch {}
    navigate("/login", { replace: true });
  }

  const linkCls = ({ isActive }) =>
    `rounded-lg px-3 py-1.5 text-sm transition ${
      isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white hover:bg-zinc-800/70"
    }`;

  return (
    <div className="min-h-screen bg-[radial-gradient(50%_60%_at_50%_0%,rgba(39,39,42,0.8),#0a0a0a)] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/40 backdrop-blur">
        <div className="w-full px-4 md:px-6 lg:px-8 py-3 flex items-center gap-3">
          <div className="flex items-center gap-6">
            <div className="text-xl font-bold tracking-tight">
              <span className="rounded bg-gradient-to-r from-indigo-500 to-violet-500 px-2 py-1">Nova</span>{" "}
              <span className="text-zinc-200">Stream</span>
            </div>
            <nav className="hidden gap-1 md:flex">
              <NavLink to="/" className={linkCls} end>Accueil</NavLink>
              <NavLink to="/movies" className={linkCls}>Films</NavLink>
              <NavLink to="/series" className={linkCls}>Séries</NavLink>
              <NavLink to="/live" className={linkCls}>TV</NavLink>
              <NavLink to="/my-list" className={linkCls}>Ma Liste</NavLink>
            </nav>
          </div>

          <div className="flex-1 px-2">
            <SearchBar />
          </div>

          {/* Icône compte à la Netflix */}
          <Link
            to="/compte"
            title="Compte"
            aria-label="Compte"
            className="grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-white/30"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/>
            </svg>
          </Link>

          <button
            onClick={onLogout}
            className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
            title="Se déconnecter"
          >
            Déconnexion
          </button>
        </div>
      </header>

      <main className="w-full px-4 md:px-6 lg:px-8 pb-16">{children}</main>
    </div>
  );
}
