// api/src/modules/xtream.js  (ESM)
import express from "express";

const router = express.Router();

/**
 * Normalise l'hôte/port en URL de base pour Xtream.
 * - Accepte "my.host", "http://my.host:8080", "https://x.y"
 * - Si pas de schéma fourni -> http par défaut (ou https si port 443)
 */
function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("Missing host");

  // Si l'utilisateur a mis un schéma, on le respecte
  if (/^https?:\/\//i.test(h)) {
    try {
      const u = new URL(h);
      // si le port en param est fourni et pas déjà dans l'URL, on l'applique
      if (port && !u.port) u.port = String(port);
      return u.toString().replace(/\/+$/, ""); // sans trailing slash
    } catch {
      throw new Error("Invalid host URL");
    }
  }

  const p = port ? parseInt(String(port), 10) : null;
  if (port && (!Number.isFinite(p) || p <= 0)) {
    throw new Error("Invalid port");
  }
  const scheme = p === 443 ? "https" : "http";
  return `${scheme}://${h}${p ? `:${p}` : ""}`;
}

/**
 * POST /xtream/test
 * Body JSON: { host, port?, username, password }
 * Teste l'endpoint Xtream Codes: /player_api.php?username=..&password=..
 */
router.post("/xtream/test", async (req, res) => {
  try {
    const { host, port, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing host/username/password" });
    }

    const base = buildBaseUrl(host, port);
    const url = `${base}/player_api.php?username=${encodeURIComponent(
      String(username)
    )}&password=${encodeURIComponent(String(password))}`;

    // Timeout 8s
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);

    let r;
    try {
      r = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(t);
    }

    if (!r.ok) {
      return res.status(502).json({ ok: false, error: `Upstream ${r.status}` });
    }

    let data;
    try {
      data = await r.json();
    } catch {
      return res.status(502).json({ ok: false, error: "Invalid JSON from Xtream" });
    }

    const userInfo = data?.user_info || {};
    const authOk =
      userInfo?.auth === 1 ||
      String(userInfo?.auth).toLowerCase() === "true" ||
      String(userInfo?.status || "").toLowerCase() === "active";

    if (!authOk) {
      return res.status(400).json({
        ok: false,
        error: "Invalid credentials or inactive account",
        user_info: userInfo,
        server_info: data?.server_info || null,
      });
    }

    return res.json({
      ok: true,
      user_info: userInfo,
      server_info: data?.server_info || null,
      base_url: base,
    });
  } catch (e) {
    const msg = e?.message || "Test failed";
    // AbortError -> timeout réseau
    if (msg.includes("AbortError")) {
      return res.status(504).json({ ok: false, error: "Timeout contacting Xtream" });
    }
    return res.status(400).json({ ok: false, error: msg });
  }
});

export default router;
