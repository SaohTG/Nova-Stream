// web/src/App.jsx
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { getJson, postJson } from "./lib/api";
import LayoutShell from "./components/LayoutShell.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import MyList from "./pages/MyList.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import { useEffect, useState } from "react";

function RequireAuth() {
  const [state, setState] = useState({ loading: true, user: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        let me = await getJson("/auth/me");
        if (!alive) return;
        setState({ loading: false, user: me?.user || null });
      } catch {
        // tente un refresh silencieux
        try { await postJson("/auth/refresh", {}); } catch {}
        try {
          let me = await getJson("/auth/me");
          if (!alive) return;
          setState({ loading: false, user: me?.user || null });
          return;
        } catch {
          if (!alive) return;
          setState({ loading: false, user: null });
        }
      }
    })();
    return () => { alive = false; };
  }, []);

  if (state.loading) return <div className="p-6 text-zinc-300">Chargement…</div>;
  if (!state.user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Routes publiques (sans header) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Routes privées (avec header unique via LayoutShell) */}
        <Route element={<RequireAuth />}>
          <Route element={<LayoutShell />}>
            <Route index element={<Home />} />
            <Route path="/movies" element={<Movies />} />
            <Route path="/series" element={<Series />} />
            <Route path="/live" element={<Live />} />
            <Route path="/my-list" element={<MyList />} />
            <Route path="/onboarding" element={<OnboardingXtream />} />
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
