// web/src/App.jsx
import { useEffect, useState, Suspense, lazy } from "react";
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

// Lazy load pages for better performance
const Home = lazy(() => import("./pages/Home.jsx"));
const Movies = lazy(() => import("./pages/Movies.jsx"));
const Series = lazy(() => import("./pages/Series.jsx"));
const Live = lazy(() => import("./pages/Live.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const OnboardingXtream = lazy(() => import("./pages/OnboardingXtream.jsx"));
const MovieCategory = lazy(() => import("./pages/MovieCategory.jsx"));
const SeriesCategory = lazy(() => import("./pages/SeriesCategory.jsx"));
const SearchPage = lazy(() => import("./pages/Search.jsx"));
const Title = lazy(() => import("./pages/Title.jsx"));
const MyList = lazy(() => import("./pages/MyList.jsx"));
const Watch = lazy(() => import("./pages/Watch.jsx"));
const Login = lazy(() => import("./pages/Login.jsx"));
const Signup = lazy(() => import("./pages/Signup.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));

function CenterLoader({ label = "Chargement…" }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
      {label}
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-zinc-400">
      <div className="flex items-center gap-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent"></div>
        Chargement de la page…
      </div>
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
        if (alive) setState({ checking: false, authed: true });
      } catch {
        if (alive) setState({ checking: false, authed: false });
      }
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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protégé */}
          <Route element={<RequireAuth />}>
            <Route element={<Shell />}>
              {/* Auth OK, Xtream facultatif */}
              <Route path="/onboarding/xtream" element={<OnboardingXtream />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/account" element={<Account />} /> {/* ← ICI */}

              {/* Contenus : Xtream requis */}
              <Route element={<RequireXtream />}>
                <Route index element={<Home />} />
                <Route path="/movies" element={<Movies />} />
                <Route path="/series" element={<Series />} />
                <Route path="/live" element={<Live />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/movies/category/:id" element={<MovieCategory />} />
                <Route path="/series/category/:id" element={<SeriesCategory />} />
                <Route path="/title/:kind/:id" element={<Title />} />
                <Route path="/my-list" element={<MyList />} />
                <Route path="/watch/:kind/:id" element={<Watch />} />
                <Route path="/watch" element={<Watch />} />
              </Route>
            </Route>
          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
