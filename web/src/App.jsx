// web/src/App.jsx
import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { getJson } from "./lib/api";

import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import Settings from "./pages/Settings.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";
import MovieCategory from "./pages/MovieCategory.jsx";
import SeriesCategory from "./pages/SeriesCategory.jsx";
import SearchPage from "./pages/Search.jsx";

import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

function CenterLoader({ label = "Chargement…" }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
      {label}
    </div>
  );
}

function RequireAuth() {
  const [state, setState] = useState({ checking: true, authed: false });
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try { await getJson("/auth/me"); if (alive) setState({ checking: false, authed: true }); }
      catch { if (alive) setState({ checking: false, authed: false }); }
    })();
    return () => { alive = false; };
  }, [loc.pathname]);

  if (state.checking) return <CenterLoader />;
  if (!state.authed) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function RequireXtream() {
  const [state, setState] = useState({ checking: true, linked: false });
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJson("/xtream/status");
        if (alive) setState({ checking: false, linked: !!j?.linked });
      } catch {
        if (alive) setState({ checking: false, linked: false });
      }
    })();
    return () => { alive = false; };
  }, [loc.pathname]);

  if (state.checking) return <CenterLoader />;
  if (!state.linked) return <Navigate to="/onboarding/xtream" replace />;
  return <Outlet />;
}

function Shell() {
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protégé */}
        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            {/* Auth mais Xtream facultatif */}
            <Route path="/onboarding/xtream" element={<OnboardingXtream />} />
            <Route path="/settings" element={<Settings />} />

            {/* Contenus: Xtream requis */}
            <Route element={<RequireXtream />}>
              <Route index element={<Home />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/series" element={<Series />} />
              <Route path="/live" element={<Live />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/movies/category/:id" element={<MovieCategory />} />
              <Route path="/series/category/:id" element={<SeriesCategory />} />
            </Route>
          </Route>
        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
