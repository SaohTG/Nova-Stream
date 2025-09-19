// web/src/components/Layout.jsx
import { NavLink, useNavigate } from "react-router-dom";
import { API_BASE, postJson } from "../lib/api";

export default function Layout({ children }) {
  const navigate = useNavigate();

  async function onLogout() {
    try {
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
      <header className="sticky top-0 z-40 backdrop-blur supports-[backdrop-filter]:bg-black/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
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
          <div className="flex items-center gap-2">
            <button
              onClick={onLogout}
              className="rounded-lg bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
              title="Se déconnecter"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16">{children}</main>
    </div>
  );
}
