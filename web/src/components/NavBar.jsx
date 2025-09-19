// web/src/components/NavBar.jsx
import { NavLink, useNavigate } from "react-router-dom";

const cls = ({ isActive }) =>
  [
    "px-3 py-2 rounded-lg transition",
    isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white",
  ].join(" ");

const API_BASE = (import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000").replace(/\/+$/, "");

export default function NavBar() {
  const nav = useNavigate();

  async function logout() {
    try {
      await fetch(`${API_BASE}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {}
    nav("/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-50 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="text-xl font-bold">Nova Stream</div>
        <nav className="flex items-center gap-1">
          <NavLink to="/" className={cls} end>
            Accueil
          </NavLink>
          <NavLink to="/movies" className={cls}>
            Films
          </NavLink>
          <NavLink to="/series" className={cls}>
            Séries
          </NavLink>
          <NavLink to="/live" className={cls}>
            TV en direct
          </NavLink>
          <button
            onClick={logout}
            className="ml-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-700"
            title="Se déconnecter"
          >
            Déconnexion
          </button>
        </nav>
      </div>
    </header>
  );
}
