// web/src/pages/LinkXtream.jsx
import { useEffect, useState } from "react";
import { ensureAccess, postJson, getJson } from "../lib/api";

export default function LinkXtream() {
  const [baseUrl, setBaseUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      try { await ensureAccess(); } catch {}
      try { setStatus(await getJson("/user/xtream")); } catch {}
    })();
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setMsg(""); setErr("");
    // 🔎 Vérif locale (montre ce qui part réellement)
    console.log("[LINK SEND]", { baseUrl, username, password });
    try {
      await ensureAccess();
      await postJson("/user/link-xtream", { baseUrl, username, password });
      setMsg("Compte Xtream lié");
      setStatus(await getJson("/user/xtream"));
    } catch (e) {
      const m = e?.data?.message || e.message || "Erreur";
      const miss = e?.data?.missing?.length ? ` → manquants: ${e.data.missing.join(", ")}` : "";
      setErr(m + miss);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "40px auto" }}>
      <h2>Lier un compte Xtream</h2>
      {status?.linked && <p>Lié: <b>{status.baseUrl}</b></p>}

      <form onSubmit={onSubmit}>
        <div>
          <label>Base URL</label>
          <input
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="http://serveur:port"
            required
          />
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
