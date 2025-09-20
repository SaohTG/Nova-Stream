// web/src/pages/LinkXtream.jsx
import { useEffect, useState } from "react";
import { ensureAccess, xtreamLink, xtreamStatus, xtreamTest, xtreamUnlink } from "../lib/api";

export default function LinkXtream() {
  const [baseUrl, setBaseUrl]   = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus]     = useState(null);
  const [msg, setMsg]           = useState("");
  const [err, setErr]           = useState("");

  async function load() {
    setErr(""); setMsg("");
    try { await ensureAccess(); } catch {}
    try { setStatus(await xtreamStatus()); } catch (e) { setStatus(null); }
  }
  useEffect(() => { load(); }, []);

  async function onLink(e) {
    e.preventDefault();
    setErr(""); setMsg("");
    try {
      await ensureAccess();
      const r = await xtreamLink(baseUrl, username, password);
      setMsg(`Compte lié: ${r.username} @ ${r.baseUrl}`);
      await load();
    } catch (e) {
      setErr(e?.data?.message ? `${e.data.message}${e.data.missing ? " → " + e.data.missing.join(", ") : ""}` : (e.message || "Erreur"));
    }
  }
  async function onTest() {
    setErr(""); setMsg("");
    try {
      await ensureAccess();
      const r = await xtreamTest(); // test avec creds sauvegardés
      setMsg(r.ok ? "Test OK" : `Test KO: ${r.reason || "?"}`);
    } catch (e) {
      setErr(e?.data?.message || e.message || "Erreur");
    }
  }
  async function onUnlink() {
    setErr(""); setMsg("");
    try { await ensureAccess(); await xtreamUnlink(); setMsg("Compte Xtream délié"); await load(); }
    catch (e) { setErr(e?.data?.message || e.message || "Erreur"); }
  }

  return (
    <div style={{ maxWidth: 560, margin: "40px auto" }}>
      <h2>Connexion Xtream</h2>

      {status?.linked ? (
        <div style={{ background: "#eef", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          <div><b>Lié :</b> {status.username} @ {status.baseUrl}</div>
          <button onClick={onTest} style={{ marginRight: 8 }}>Tester</button>
          <button onClick={onUnlink}>Délier</button>
        </div>
      ) : (
        <div style={{ background: "#ffe", padding: 10, borderRadius: 8, marginBottom: 12 }}>
          Aucun compte Xtream lié.
        </div>
      )}

      <form onSubmit={onLink}>
        <div>
          <label>Base URL</label>
          <input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="http://serveur:port" required />
        </div>
        <div>
          <label>Utilisateur</label>
          <input value={username} onChange={e => setUsername(e.target.value)} required />
        </div>
        <div>
          <label>Mot de passe</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button type="submit">Lier</button>
      </form>

      {msg && <p style={{ color: "green" }}>{msg}</p>}
      {err && <p style={{ color: "crimson", whiteSpace: "pre-wrap" }}>{err}</p>}
    </div>
  );
}
