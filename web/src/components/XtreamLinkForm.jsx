// web/src/components/XtreamLinkForm.jsx
import { useState } from "react";

export default function XtreamLinkForm() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  // Utilise /api si défini, sinon racine (les deux fonctionnent côté API)
  const API_BASE = (import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000").replace(/\/+$/, "");

  // Si l’utilisateur colle une URL complète (http(s)://host:port), on récupère le port auto si vide
  function onHostBlur() {
    try {
      const h = host.trim();
      if (!h) return;
      if (/^https?:\/\//i.test(h)) {
        const u = new URL(h);
        if (!port && u.port) setPort(u.port);
        // normalise minimalement l'affichage (optionnel)
        if (u.hostname && (u.protocol === "http:" || u.protocol === "https:")) {
          setHost(u.toString().replace(/\/+$/, ""));
        }
      }
    } catch {
      /* ignore parsing errors, API gèrera */
    }
  }

  async function onLink(e) {
    e?.preventDefault?.();
    setLinking(true);
    setError(null);
    setOkMsg(null);

    try {
      const res = await fetch(`${API_BASE}/user/link-xtream`, {
        method: "POST",
        credentials: "include", // 🔥 requiert que l'API réponde avec CORS credentials
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: port ? Number(port) : undefined, // optionnel si dans l’URL
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // remonte le message API quand dispo (ex: Missing fields / Invalid API_ENCRYPTION_KEY / Unauthorized)
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      setOkMsg("Compte Xtream lié avec succès.");
      // Redirige (adapter la route si besoin)
      window.location.href = "/";
    } catch (err) {
      setError(err?.message || "Erreur lors de la liaison");
    } finally {
      setLinking(false);
    }
  }

  const canLink = Boolean(host.trim() && username.trim() && password);

  const hint =
    "Exemples: host = http://monserveur.tld:8080  (ou)  host = monserveur.tld + port = 8080";

  return (
    <form
      onSubmit={onLink}
      className="mx-auto max-w-lg rounded-2xl bg-zinc-900/60 p-6 shadow-lg ring-1 ring-white/10"
    >
      <h2 className="mb-4 text-xl font-semibold text-white">Lier votre compte Xtream</h2>
      <p className="mb-6 text-sm text-zinc-300">{hint}</p>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-zinc-300">Hôte ou URL</label>
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="ex: http://monserveur.tld:8080 ou monserveur.tld"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          onBlur={onHostBlur}
          required
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-zinc-300">Port (optionnel si dans l’URL)</label>
        <input
          type="number"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="ex: 8080"
          value={port}
          onChange={(e) => setPort(e.target.value)}
          min={1}
        />
      </div>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-zinc-300">Username Xtream</label>
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
      </div>

      <div className="mb-6">
        <label className="mb-1 block text-sm text-zinc-300">Password Xtream</label>
        <input
          type="password"
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {okMsg && (
        <div className="mb-4 rounded-lg bg-emerald-900/40 px-3 py-2 text-sm text-emerald-200" aria-live="polite">
          {okMsg}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-rose-900/40 px-3 py-2 text-sm text-rose-200" aria-live="assertive">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={!canLink || linking}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {linking ? "Liaison…" : "Lier maintenant"}
        </button>
      </div>
    </form>
  );
}
