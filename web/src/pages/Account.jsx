// web/src/pages/Account.jsx
import { useEffect, useMemo, useState } from "react";
import { getJson, postJson as apiPostJson } from "../lib/api";
import { clearCache } from "../lib/clientCache";

async function postJson(url, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`HTTP_${r.status}`);
  return r.json().catch(() => ({}));
}

async function postJsonDirect(url, body) {
  return await apiPostJson(url, body);
}
async function del(url) {
  const r = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(`HTTP_${r.status}`);
}

function Spinner({ label }) {
  return (
    <div className="flex items-center gap-2 text-zinc-300">
      <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
        <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4"/>
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

function parsePlaylistInput(input) {
  const s = String(input || "").trim();
  if (!s) return null;

  // 1) URL M3U type get.php / playlist.m3u
  try {
    const u = new URL(s);
    const user = u.searchParams.get("username") || u.searchParams.get("user") || "";
    const pass = u.searchParams.get("password") || u.searchParams.get("pass") || "";
    // normalise base (retire /get.php, /playlist, /live/…)
    let base = s;
    base = base.replace(/\/player_api\.php.*$/i, "")
               .replace(/\/get\.php.*$/i, "")
               .replace(/\/playlist\.m3u.*$/i, "")
               .replace(/\/(?:series|movie|live)\/.*$/i, "");
    if (user && pass) {
      return { base_url: base.replace(/\/+$/,""), username: user, password: pass };
    }
  } catch {}

  // 2) Chaîne "base|username|password" ou "base username password"
  const m = s.match(/^(.+?)[\s|]+([^|\s]+)[\s|]+([^|\s]+)$/);
  if (m) {
    return {
      base_url: m[1].trim().replace(/\/player_api\.php.*$/i, "").replace(/\/+$/,""),
      username: m[2].trim(),
      password: m[3].trim(),
    };
  }

  // 3) Rien d’exploitable
  return null;
}

export default function Account() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [acct, setAcct] = useState(null); // { base_url, username_masked?, username?, created_at? }

  // form
  const [mode, setMode] = useState("idle"); // idle | edit
  const [playlistRaw, setPlaylistRaw] = useState("");
  const parsed = useMemo(() => parsePlaylistInput(playlistRaw), [playlistRaw]);
  
  // Settings: Xtream status & refresh cache
  const [xtreamState, setXtreamState] = useState({ loading: true, linked: false, error: null });
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        // Attendu côté API:
        // GET /api/xtream/account -> { base_url, username, has_password: true, created_at }
        const j = await getJson("/xtream/account");
        if (!alive) return;
        setAcct(j && j.base_url ? j : null);
      } catch {
        if (!alive) return;
        setAcct(null);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);
  
  // Charger le statut Xtream
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const status = await getJson("/xtream/status");
        if (alive) {
          setXtreamState({
            loading: false,
            linked: !!status?.linked,
            error: null
          });
        }
      } catch (e) {
        if (alive) {
          setXtreamState({
            loading: false,
            linked: false,
            error: e?.message || "Erreur"
          });
        }
      }
    })();
    return () => { alive = false; };
  }, []);
  
  const handleRefreshCache = async () => {
    setRefreshing(true);
    setRefreshMessage(null);
    try {
      // Vider le cache côté serveur
      await postJsonDirect("/xtream/refresh-cache");
      
      // Vider aussi le cache côté client
      clearCache();
      
      setRefreshMessage({ 
        type: 'success', 
        text: "✅ Cache vidé ! Retournez à l'accueil pour recharger les nouveautés." 
      });
      
      // Auto-redirect après 2 secondes
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    } catch (error) {
      setRefreshMessage({ 
        type: 'error', 
        text: error?.message || "Erreur lors du rafraîchissement du cache" 
      });
    } finally {
      setRefreshing(false);
    }
  };

  async function onSave(e) {
    e?.preventDefault();
    if (!parsed) { setErr("Entrée invalide. Fournissez une URL M3U valide ou base|user|pass."); return; }
    setSaving(true);
    setErr("");
    try {
      // Attendu côté API: POST /api/xtream/account { base_url, username, password }
      const j = await postJson("/xtream/account", parsed);
      setAcct(j && j.base_url ? j : { base_url: parsed.base_url, username: parsed.username, has_password: true });
      setMode("idle");
      setPlaylistRaw("");
    } catch (e) {
      setErr("Échec d’enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    setSaving(true);
    setErr("");
    try {
      // Attendu côté API: DELETE /api/xtream/account
      await del("/xtream/account");
      setAcct(null);
      setMode("edit");
    } catch {
      setErr("Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Mon Compte</h1>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Carte Playlist */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400">
                {/* Icône "playlist" */}
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
                  <path d="M3 6h14v2H3V6zm0 4h14v2H3v-2zm0 4h10v2H3v-2zM19 6h2v12h-2V6zM16 9h2v9h-2V9z"/>
                </svg>
              </div>
              <div>
                <div className="text-sm text-zinc-400">Playlist Xtream</div>
                {loading ? (
                  <div className="mt-1"><Spinner /></div>
                ) : acct ? (
                  <div className="mt-1 text-zinc-100">
                    {new URL(acct.base_url).hostname}
                    <span className="text-zinc-400"> • </span>
                    <span className="font-mono">{acct.username || "••••••"}</span>
                  </div>
                ) : (
                  <div className="mt-1 text-zinc-400">Aucune playlist configurée.</div>
                )}
              </div>
            </div>

            {!loading && (
              <div className="flex gap-2">
                {acct && (
                  <button className="btn bg-zinc-800 hover:bg-zinc-700" onClick={() => setMode("edit")}>
                    Remplacer
                  </button>
                )}
                {acct && (
                  <button className="btn bg-red-600 text-white hover:bg-red-500" onClick={onDelete} disabled={saving}>
                    Supprimer
                  </button>
                )}
                {!acct && (
                  <button className="btn bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => setMode("edit")}>
                    Ajouter
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Formulaire */}
          {mode === "edit" && (
            <form onSubmit={onSave} className="mt-5 space-y-3">
              <label className="block text-sm text-zinc-300">
                URL M3U complète <span className="text-zinc-500">(ou “base|username|password”)</span>
                <input
                  value={playlistRaw}
                  onChange={(e) => setPlaylistRaw(e.target.value)}
                  placeholder="ex: https://host/get.php?username=USER&password=PASS&type=m3u"
                  className="mt-1 w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-white/20"
                />
              </label>

              {playlistRaw && (
                <div className={`text-xs ${parsed ? "text-emerald-400" : "text-red-400"}`}>
                  {parsed
                    ? `Detecté: ${parsed.base_url} • ${parsed.username}`
                    : "Entrée non reconnue"}
                </div>
              )}

              {err && <div className="text-sm text-red-400">{err}</div>}

              <div className="pt-1 flex items-center gap-2">
                <button
                  type="submit"
                  className="btn bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60"
                  disabled={saving || !parsed}
                >
                  {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button type="button" className="btn" onClick={() => { setMode("idle"); setErr(""); }}>
                  Annuler
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Aide rapide */}
        <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
          <h2 className="text-lg font-semibold">Aide</h2>
          <ul className="mt-3 list-disc pl-5 text-sm text-zinc-300 space-y-2">
            <li>Collez l'URL M3U fournie par votre fournisseur Xtream.</li>
            <li>Ou saisissez "base|username|password".</li>
            <li>La playlist est utilisée pour les films, séries et live.</li>
          </ul>
        </div>
      </div>

      {/* Section Paramètres */}
      <div className="mt-6">
        <h2 className="text-xl font-bold mb-4">Paramètres</h2>
        
        {xtreamState.loading ? (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
            <Spinner label="Chargement..." />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-5">
            {/* Statut de connexion Xtream */}
            <div className="mb-6 pb-6 border-b border-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-white mb-1">Statut Xtream</h3>
                  <p className="text-sm text-zinc-400">
                    État de votre connexion au serveur Xtream
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {xtreamState.linked ? (
                    <>
                      <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
                      <span className="text-sm font-medium text-emerald-400">Connecté</span>
                    </>
                  ) : (
                    <>
                      <div className="h-3 w-3 rounded-full bg-red-500"></div>
                      <span className="text-sm font-medium text-red-400">Non connecté</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Actualiser la playlist */}
            <div>
              <h3 className="text-base font-semibold text-white mb-2">Actualiser la playlist</h3>
              <p className="text-sm text-zinc-400 mb-4">
                Vide le cache et récupère les dernières nouveautés de votre serveur Xtream
              </p>
              
              {refreshMessage && (
                <div className={`mb-4 p-3 rounded-lg text-sm ${
                  refreshMessage.type === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {refreshMessage.text}
                </div>
              )}
              
              <button
                onClick={handleRefreshCache}
                disabled={refreshing}
                className="w-full rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 px-4 py-3 text-sm font-medium text-white hover:from-primary-500 hover:to-accent-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:shadow-glow"
              >
                {refreshing ? (
                  <>
                    <Spinner label="" />
                    Actualisation en cours...
                  </>
                ) : (
                  <>
                    <svg className="inline-block w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Actualiser la playlist
                  </>
                )}
              </button>
              
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <div className="text-zinc-400 mb-1">Cache serveur</div>
                  <div className="text-white font-semibold">12 heures</div>
                </div>
                <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <div className="text-zinc-400 mb-1">Cache local</div>
                  <div className="text-white font-semibold">5 minutes</div>
                </div>
              </div>
              
              <p className="mt-3 text-xs text-zinc-500 text-center">
                💡 Le cache améliore la vitesse et réduit les erreurs de connexion
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
