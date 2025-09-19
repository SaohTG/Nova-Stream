// web/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import RequireAuth from "./components/RequireAuth.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <NavBar />
      <main className="px-4 pb-16 pt-6">
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protégées */}
          <Route
            path="/"
            element={
              <RequireAuth>
                <Home />
              </RequireAuth>
            }
          />
          <Route
            path="/movies"
            element={
              <RequireAuth>
                <Movies />
              </RequireAuth>
            }
          />
          <Route
            path="/series"
            element={
              <RequireAuth>
                <Series />
              </RequireAuth>
            }
          />
          <Route
            path="/live"
            element={
              <RequireAuth>
                <Live />
              </RequireAuth>
            }
          />
          <Route
            path="/onboarding"
            element={
              <RequireAuth>
                <OnboardingXtream />
              </RequireAuth>
            }
          />

          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
