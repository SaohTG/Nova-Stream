// web/src/components/NavBar.jsx
import { NavLink } from "react-router-dom";

const linkCls = ({ isActive }) =>
  [
    "px-3 py-2 rounded-lg transition",
    isActive ? "bg-zinc-800 text-white" : "text-zinc-300 hover:text-white",
  ].join(" ");

export default function NavBar() {
  return (
    <header className="sticky top-0 z-50 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="text-xl font-bold">Nova Stream</div>
        <nav className="flex gap-1">
          <NavLink to="/" className={linkCls} end>
            Accueil
          </NavLink>
          <NavLink to="/movies" className={linkCls}>
            Films
          </NavLink>
          <NavLink to="/series" className={linkCls}>
            Séries
          </NavLink>
          <NavLink to="/live" className={linkCls}>
            TV en direct
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
