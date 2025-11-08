// web/src/pages/Signup.jsx
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:4000").replace(/\/+$/, "");

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const redirect = sp.get("redirect") || "/onboarding";

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      nav(redirect, { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Erreur d'inscription");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 relative">
      {/* Arrière-plan avec dégradés */}
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_30%_30%,rgba(59,130,246,0.2),transparent_50%),radial-gradient(circle_at_70%_70%,rgba(217,70,239,0.2),transparent_50%)]"></div>
      
      <section className="mx-auto w-full max-w-md animate-scale-in">
        {/* Logo/Titre */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center gap-3 mb-4">
            <div className="rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 p-3 shadow-glow">
              <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
              Nova Stream
            </h1>
          </div>
          <p className="text-zinc-400 text-sm">Créez votre compte pour commencer</p>
        </div>

        <form onSubmit={onSubmit} className="card p-8 space-y-6">
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-200 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              Email
            </label>
            <input
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="vous@exemple.com"
            />
          </div>
          
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-200 flex items-center gap-2">
              <svg className="w-4 h-4 text-primary-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              Mot de passe
            </label>
            <input
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              required
              placeholder="min. 6 caractères"
            />
            <p className="mt-2 text-xs text-zinc-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Utilisez au moins 6 caractères pour sécuriser votre compte
            </p>
          </div>

          {err && (
            <div className="rounded-xl bg-rose-500/10 border border-rose-500/20 p-4 flex items-start gap-3 animate-slide-down">
              <svg className="w-5 h-5 text-rose-400 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <div>
                <h3 className="text-sm font-medium text-rose-200">Erreur d'inscription</h3>
                <p className="text-sm text-rose-300/80 mt-1">{err}</p>
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Création en cours…
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                </svg>
                Créer mon compte
              </>
            )}
          </button>

          <div className="pt-4 border-t border-white/10 text-center">
            <p className="text-sm text-zinc-400">
              Déjà inscrit ?{" "}
              <Link 
                to={`/login?redirect=${encodeURIComponent(redirect)}`} 
                className="text-primary-400 hover:text-primary-300 font-medium transition-colors hover:underline"
              >
                Se connecter
              </Link>
            </p>
          </div>
        </form>

        {/* Infos supplémentaires */}
        <p className="mt-6 text-center text-xs text-zinc-500">
          En créant un compte, vous acceptez nos conditions d'utilisation
        </p>
      </section>
    </div>
  );
}
