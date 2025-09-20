// web/src/components/RequireXtream.jsx
import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:4000").replace(/\/+$/, "");

export default function RequireXtream({ children }) {
  const [ok, setOk] = useState(null);
  const nav = useNavigate();
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/user/has-xtream`, { credentials: "include" });
        if (r.status === 401) {
          nav(`/login?redirect=${encodeURIComponent(loc.pathname)}`, { replace: true });
          return;
        }
        const data = await r.json().catch(() => ({}));
        if (!alive) return;
        if (data?.linked) setOk(true);
        else {
          setOk(false);
          nav(`/onboarding?redirect=${encodeURIComponent(loc.pathname)}`, { replace: true });
        }
      } catch {
        if (!alive) return;
        setOk(false);
        nav(`/onboarding?redirect=${encodeURIComponent(loc.pathname)}`, { replace: true });
      }
    })();
    return () => { alive = false; };
  }, [loc.pathname, nav]);

  if (ok === null) {
    return <div className="flex min-h-[40vh] items-center justify-center text-zinc-400">Vérification de votre liaison Xtream…</div>;
  }
  if (ok === false) return null;
  return children;
}
