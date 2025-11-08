// web/src/components/SearchBar.jsx
import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";

export default function SearchBar() {
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const loc = useLocation();
  const [q, setQ] = useState("");

  useEffect(() => {
    if (loc.pathname.startsWith("/search")) setQ(sp.get("q") || "");
  }, [loc.pathname, sp]);

  const onSubmit = (e) => {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    navigate(`/search?q=${encodeURIComponent(s)}`);
  };

  return (
    <form onSubmit={onSubmit} className="w-full max-w-xl">
      <div className="relative group">
        {/* Icône de recherche à gauche */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-primary-500 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        
        <input
          type="search"
          placeholder="Rechercher films, séries, chaînes TV..."
          className="input pl-11 pr-12 py-2.5 w-full"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        
        {/* Bouton de recherche */}
        <button
          type="submit"
          aria-label="Rechercher"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1.5 bg-primary-600/80 hover:bg-primary-600 text-white transition-all duration-300 hover:scale-105 flex items-center gap-1 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <span className="hidden sm:inline">Rechercher</span>
        </button>
        
        {/* Ligne animée en focus */}
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary-500 to-accent-500 scale-x-0 group-focus-within:scale-x-100 transition-transform duration-300 origin-left"></div>
      </div>
    </form>
  );
}
