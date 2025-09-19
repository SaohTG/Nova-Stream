// web/src/components/RequireAuth.jsx
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000").replace(/\/+$/, "");

export default function RequireAuth({ children }) {
  const [ok, setOk] = useState(null); // null = loading
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // ping /auth/me
        let r = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        if (r.status === 401) {
          // tente un refresh silencieux
          await fetch(`${API_BASE}/auth/refresh`, { method: "POST", credentials: "include" });
          r = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
        }
        if (!alive) return;
        if (r.ok) setOk(true);
        else {
          setOk(false);
          nav(`/login?redirect=${encodeURIComponent(loc.pathname)}`, { replace: true });
        }
      } catch {
        if (!alive) return;
        setOk(false);
        nav(`/login?redirect=${encodeURIComponent(loc.pathname)}`, { replace: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [loc.pathname, nav]);

  if (ok === null) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-zinc-400">
        Chargement de votre session…
      </div>
    );
  }
  if (ok === false) return null; // redirigé
  return children;
}
