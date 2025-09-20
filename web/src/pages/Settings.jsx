// web/src/pages/Settings.jsx
import { useEffect, useState } from "react";
import { getJson } from "../lib/api";
import { Link } from "react-router-dom";

export default function Settings() {
  const [state, setState] = useState({ loading: true, linked: false, error: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const j = await getJson("/user/has-xtream"); // { linked: boolean }
        if (!alive) return;
        setState({ loading: false, linked: !!j?.linked, error: null });
      } catch (e) {
        if (!alive) return;
        setState({ loading: false, linked: false, error: e?.message || "Erreur" });
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Paramètres</h1>

      {state.loading ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : state.error ? (
        <div className="rounded-lg bg-rose-900/40 p-3 text-rose-200">{state.error}</div>
      ) : (
        <>
          <div className="rounded-xl bg-zinc-900/60 p-4 ring-1 ring-white/10">
            <div className="mb-2 text-sm text-zinc-400">Compte Xtream</div>
            <div className="flex items-center justify-between">
              <div className="text-white">
                {state.linked ? "✅ Compte Xtream lié" : "❌ Aucun compte Xtream lié"}
              </div>
              <Link
                to="/onboarding/xtream"
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
              >
                {state.linked ? "Modifier" : "Lier maintenant"}
              </Link>
            </div>
          </div>

          {/* Ajoute ici d’autres sections (sessions, appareils, etc.) si besoin */}
        </>
      )}
    </div>
  );
}
