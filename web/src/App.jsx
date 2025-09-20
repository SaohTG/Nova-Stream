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

// Layout & pages
import Layout from "./components/Layout.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import Settings from "./pages/Settings.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";

// Voir plus (catégories complètes)
import MovieCategory from "./pages/MovieCategory.jsx";
import SeriesCategory from "./pages/SeriesCategory.jsx";

// Auth
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

/* ------------------------------ Garde Auth ------------------------------ */

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
      try {
        await getJson("/auth/me");
        if (!alive) return;
        setState({ checking: false, authed: true });
      } catch {
        if (!alive) return;
        setState({ checking: false, authed: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [loc.pathname]);

  if (state.checking) return <CenterLoader />;
  if (!state.authed) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/* --------------------------- Garde Xtream link --------------------------- */

function RequireXtream() {
  const [state, setState] = useState({ checking: true, linked: false });
  const loc = useLocation();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJson("/user/has-xtream");
        if (!alive) return;
        setState({ checking: false, linked: !!j?.linked });
      } catch {
        if (!alive) return;
        setState({ checking: false, linked: false });
      }
    })();
    return () => {
      alive = false;
    };
  }, [loc.pathname]);

  if (state.checking) return <CenterLoader />;
  if (!state.linked) return <Navigate to="/onboarding/xtream" replace />;
  return <Outlet />;
}

/* --------------------------- Shell = Layout once -------------------------- */

function Shell() {
  // Layout doit rendre <Outlet/> quelque part dans ses children
  return (
    <Layout>
      <Outlet />
    </Layout>
  );
}

/* --------------------------------- App ---------------------------------- */

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Protégé: nécessite auth */}
        <Route element={<RequireAuth />}>
          {/* Layout unique */}
          <Route element={<Shell />}>
            {/* Onboarding/Settings : auth requis mais Xtream facultatif */}
            <Route path="/onboarding/xtream" element={<OnboardingXtream />} />
            <Route path="/settings" element={<Settings />} />

            {/* Contenus : nécessitent également un compte Xtream lié */}
            <Route element={<RequireXtream />}>
              <Route index element={<Home />} />
              <Route path="/movies" element={<Movies />} />
              <Route path="/series" element={<Series />} />
              <Route path="/live" element={<Live />} />

              {/* “Voir plus” catégories */}
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
