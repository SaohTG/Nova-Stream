// web/src/components/XtreamLinkForm.jsx
import { useState } from "react";

export default function XtreamLinkForm() {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [testing, setTesting] = useState(false);
  const [linking, setLinking] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  const API_BASE = import.meta.env.VITE_API_BASE || "http://85.31.239.110:4000";

  async function onTest(e) {
    e?.preventDefault?.();
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/xtream/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: port ? Number(port) : undefined,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        setTestResult({ ok: false, message: data?.error || `HTTP ${res.status}` });
      } else {
        setTestResult({ ok: true, message: "Connexion Xtream OK" });
      }
    } catch (err) {
      setTestResult({ ok: false, message: err?.message || "Erreur réseau" });
    } finally {
      setTesting(false);
    }
  }

  async function onLink(e) {
    e?.preventDefault?.();
    setLinking(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/user/link-xtream`, {
        method: "POST",
        credentials: "include", // 🔥 envoie les cookies JWT
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          host: host.trim(),
          port: port ? Number(port) : undefined,
          username: username.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      // Succès → redirige (ou route vers l’accueil / dashboard)
      window.location.href = "/";
    } catch (err) {
      setError(err?.message || "Erreur lors de la liaison");
    } finally {
      setLinking(false);
    }
  }

  const canLink = host.trim() && username.trim() && password; // ✅ plus besoin de testOk
  const hint =
    "Exemples: host = http://monserveur.tld:8080  (ou)  host = monserveur.tld + port = 8080";

  return (
    <form className="mx-auto max-w-lg rounded-2xl bg-zinc-900/60 p-6 shadow-lg ring-1 ring-white/10">
      <h2 className="mb-4 text-xl font-semibold text-white">Lier votre compte Xtream</h2>
      <p className="mb-6 text-sm text-zinc-300">{hint}</p>

      <div className="mb-4">
        <label className="mb-1 block text-sm text-zinc-300">Hôte ou URL</label>
        <input
          className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-white outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="ex: http://monserveur.tld:8080 ou monserveur.tld"
          value={host}
          onChange={(e) => setHost(e.target.value)}
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

      {testResult && (
        <div
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            testResult.ok ? "bg-emerald-900/40 text-emerald-200" : "bg-rose-900/40 text-rose-200"
          }`}
        >
          {testResult.message}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-rose-900/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className="rounded-lg border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm text-zinc-200 transition hover:bg-zinc-700 disabled:opacity-60"
          title="Optionnel"
        >
          {testing ? "Test en cours…" : "Tester (optionnel)"}
        </button>

        <button
          type="submit"
          onClick={onLink}
          disabled={!canLink || linking}
          className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
        >
          {linking ? "Liaison…" : "Lier maintenant"}
        </button>
      </div>
    </form>
  );
}
