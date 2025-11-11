// web/src/pages/Settings.jsx
import { useEffect, useState } from "react";
import { getJson, postJson } from "../lib/api";
import { Link } from "react-router-dom";

export default function Settings() {
  const [state, setState] = useState({ loading: true, linked: false, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

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

  const handleRefreshCache = async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      const result = await postJson("/xtream/refresh-cache");
      setRefreshMessage({ 
        type: 'success', 
        text: result?.message || "Cache vidé ! Rechargez la page pour voir les nouveautés." 
      });
    } catch (error) {
      setRefreshMessage({ 
        type: 'error', 
        text: error?.message || "Erreur lors du rafraîchissement du cache" 
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">Paramètres</h1>

      {state.loading ? (
        <div className="text-zinc-400">Chargement…</div>
      ) : state.error ? (
        <div className="rounded-lg bg-rose-900/40 p-3 text-rose-200">{state.error}</div>
      ) : (
        <>
          {/* Compte Xtream */}
          <div className="card p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-white mb-1">Compte Xtream</h2>
                <p className="text-sm text-zinc-400">
                  {state.linked ? "Votre compte est lié et actif" : "Liez votre compte pour accéder au contenu"}
                </p>
              </div>
              <Link
                to="/onboarding/xtream"
                className="btn-secondary flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {state.linked ? "Modifier" : "Lier"}
              </Link>
            </div>
            
            <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg ${
              state.linked 
                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                : 'bg-zinc-800 border border-zinc-700 text-zinc-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${state.linked ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`}></div>
              <span className="text-sm font-medium">
                {state.linked ? "Connecté" : "Non connecté"}
              </span>
            </div>
          </div>

          {/* Cache et Performance */}
          {state.linked && (
            <div className="card p-6">
              <div className="mb-4">
                <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
                  <svg className="w-5 h-5 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                  </svg>
                  Cache et Performance
                </h2>
                <p className="text-sm text-zinc-400">
                  Les données sont mises en cache pendant 12h pour améliorer la vitesse
                </p>
              </div>
              
              {refreshMessage && (
                <div className={`mb-4 rounded-xl p-4 flex items-start gap-3 animate-slide-down ${
                  refreshMessage.type === 'success' 
                    ? 'bg-emerald-500/10 border border-emerald-500/20' 
                    : 'bg-rose-500/10 border border-rose-500/20'
                }`}>
                  <svg className={`w-5 h-5 mt-0.5 shrink-0 ${
                    refreshMessage.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                  }`} fill="currentColor" viewBox="0 0 20 20">
                    {refreshMessage.type === 'success' ? (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    ) : (
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                    )}
                  </svg>
                  <div>
                    <p className={`text-sm font-medium ${
                      refreshMessage.type === 'success' ? 'text-emerald-200' : 'text-rose-200'
                    }`}>
                      {refreshMessage.text}
                    </p>
                  </div>
                </div>
              )}
              
              <button
                onClick={handleRefreshCache}
                disabled={refreshing}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white font-medium transition-all duration-300 hover:shadow-glow hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Actualisation en cours...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualiser la playlist
                  </>
                )}
              </button>
              
              <p className="mt-3 text-xs text-zinc-500 text-center">
                Vide le cache et récupère les dernières nouveautés de votre serveur Xtream
              </p>
            </div>
          )}

          {/* Autres paramètres */}
        </>
      )}
    </div>
  );
}
