import { useState, useEffect } from "react";
import { postJson, getJson } from "../lib/api";

export default function LinkXtream() {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { loadStatus(); }, []);

  async function loadStatus() {
    try { setStatus(await getJson("/user/xtream")); }
    catch { setStatus(null); }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      await postJson("/user/link-xtream", { baseUrl, username, password });
      await loadStatus();
    } catch (e) {
      setErr(e.message || "Erreur");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2>Lier un compte Xtream</h2>
      {status?.linked && (
        <p style={{ background: "#eef", padding: 8, borderRadius: 6 }}>
          Compte lié — <b>{status.baseUrl}</b>
        </p>
      )}
      <form onSubmit={onSubmit}>
        <div><label>Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://serveur:port" required />
        </div>
        <div><label>Utilisateur</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div><label>Mot de passe</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button disabled={loading} type="submit">{loading ? "Lien..." : "Lier"}</button>
        {err && <p style={{ color: "crimson" }}>{err}</p>}
      </form>
      <button onClick={loadStatus} style={{ marginTop: 12 }}>Rafraîchir l’état</button>
    </div>
  );
}
