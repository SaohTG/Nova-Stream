// web/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";

// Layout
import NavBar from "./components/NavBar.jsx";

// Guards
import RequireAuth from "./components/RequireAuth.jsx";
import RequireXtream from "./components/RequireXtream.jsx";

// Pages
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <NavBar />
      <main className="px-4 pb-16 pt-6">
        <Routes>
          {/* --- Public routes --- */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* --- Protected routes (auth + xtream linked) --- */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <RequireXtream>
                  <Home />
                </RequireXtream>
              </RequireAuth>
            }
          />
          <Route
            path="/movies"
            element={
              <RequireAuth>
                <RequireXtream>
                  <Movies />
                </RequireXtream>
              </RequireAuth>
            }
          />
          <Route
            path="/series"
            element={
              <RequireAuth>
                <RequireXtream>
                  <Series />
                </RequireXtream>
              </RequireAuth>
            }
          />
          <Route
            path="/live"
            element={
              <RequireAuth>
                <RequireXtream>
                  <Live />
                </RequireXtream>
              </RequireAuth>
            }
          />

          {/* --- Onboarding Xtream (auth requis, mais pas RequireXtream sinon boucle) --- */}
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingXtream />
              </RequireAuth>
            }
          />

          {/* --- Fallback --- */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
