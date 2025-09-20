// web/src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://localhost:4000").replace(/\/+$/, "");

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const redirect = sp.get("redirect") || "/";

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      nav(redirect, { replace: true });
    } catch (e2) {
      setErr(e2?.message || "Erreur de connexion");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-md">
      <h1 className="mb-6 text-2xl font-semibold">Connexion</h1>
      <form onSubmit={onSubmit} className="rounded-2xl bg-zinc-900/60 p-6 ring-1 ring-white/10">
        <div className="mb-4">
          <label className="mb-1 block text-sm text-zinc-300">Email</label>
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            required
            placeholder="vous@exemple.com"
          />
        </div>
        <div className="mb-6">
          <label className="mb-1 block text-sm text-zinc-300">Mot de passe</label>
          <input
            className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
            placeholder="••••••••"
          />
        </div>

        {err && <div className="mb-4 rounded-lg bg-rose-900/40 p-3 text-rose-200">{err}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {loading ? "Connexion…" : "Se connecter"}
        </button>

        <div className="mt-4 text-sm text-zinc-300">
          Pas de compte ?{" "}
          <Link to={`/signup?redirect=${encodeURIComponent(redirect)}`} className="text-indigo-400 hover:underline">
            Créer un compte
          </Link>
        </div>
      </form>
    </section>
  );
}
