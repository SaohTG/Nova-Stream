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
      <div className="relative">
        <input
          type="search"
          placeholder="Rechercher films, séries, chaînes TV"
          className="input pr-10"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          type="submit"
          aria-label="Rechercher"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-300 hover:text-white"
        >
          🔍
        </button>
      </div>
    </form>
  );
}
