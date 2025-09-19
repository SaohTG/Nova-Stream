// web/src/App.jsx
import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar.jsx";
import Home from "./pages/Home.jsx";
import Movies from "./pages/Movies.jsx";
import Series from "./pages/Series.jsx";
import Live from "./pages/Live.jsx";
import OnboardingXtream from "./pages/OnboardingXtream.jsx";

export default function App() {
  return (
    <div className="min-h-screen bg-black text-white">
      <NavBar />
      <main className="px-4 pb-16 pt-6">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/movies" element={<Movies />} />
          <Route path="/series" element={<Series />} />
          <Route path="/live" element={<Live />} />
          <Route path="/onboarding" element={<OnboardingXtream />} />
          {/* fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
