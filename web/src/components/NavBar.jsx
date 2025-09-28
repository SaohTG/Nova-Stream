// web/src/components/NavBar.jsx
import { NavLink, useNavigate, Link } from "react-router-dom";
import SearchBar from "./SearchBar.jsx";

const cls = ({ isActive }) =>
  ["px-3 py-2 rounded-lg transition", isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white"].join(" ");

const API_BASE = (import.meta.env.VITE_API_BASE || "/api").replace(/\/+$/, "");

export default function NavBar() {
  const nav = useNavigate();
  async function logout() {
    try {
      localStorage.removeItem("access_token");
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    nav("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link to="/" className="text-xl font-bold text-white">Nova Stream</Link>

        <nav className="hidden md:flex items-center gap-1">
          <NavLink to="/" className={cls} end>Accueil</NavLink>
          <NavLink to="/movies" className={cls}>Films</NavLink>
          <NavLink to="/series" className={cls}>Séries</NavLink>
          <NavLink to="/live" className={cls}>TV en direct</NavLink>
        </nav>

        <div className="flex-1 px-2">
          <SearchBar />
        </div>

        {/* Icône compte à la Netflix */}
        <Link
          to="/compte"
          className="relative grid h-9 w-9 place-items-center rounded-full bg-zinc-800 text-zinc-200 hover:bg-zinc-700 focus:outline-none focus:ring-2 focus:ring-white/30"
          title="Compte"
          aria-label="Compte"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
            <path d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12zm0 2c-4.42 0-8 2.69-8 6v1h16v-1c0-3.31-3.58-6-8-6z"/>
          </svg>
        </Link>

        <button
          onClick={logout}
          className="rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
          title="Se déconnecter"
        >
          Déconnexion
        </button>
      </div>
    </header>
  );
}
