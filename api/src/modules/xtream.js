// api/src/modules/xtream.js (ESM)
import express from "express";
const router = express.Router();

function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("Missing host");
  if (/^https?:\/\//i.test(h)) {
    const u = new URL(h);
    if (port && !u.port) u.port = String(port);
    return u.toString().replace(/\/+$/, "");
  }
  const p = port ? parseInt(String(port), 10) : null;
  if (port && (!Number.isFinite(p) || p <= 0)) throw new Error("Invalid port");
  const scheme = p === 443 ? "https" : "http";
  return `${scheme}://${h}${p ? `:${p}` : ""}`;
}

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

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    let r;
    try {
      r = await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(t);
    }
    if (!r.ok) return res.status(502).json({ ok: false, error: `Upstream ${r.status}` });

    let data;
    try {
      data = await r.json();
    } catch {
      return res.status(502).json({ ok: false, error: "Invalid JSON from Xtream" });
    }

    const ui = data?.user_info || {};
    const authOk =
      ui?.auth === 1 ||
      String(ui?.auth).toLowerCase() === "true" ||
      String(ui?.status || "").toLowerCase() === "active";

    if (!authOk) {
      return res.status(400).json({
        ok: false,
        error: "Invalid credentials or inactive account",
        user_info: ui,
        server_info: data?.server_info || null,
      });
    }

    return res.json({
      ok: true,
      user_info: ui,
      server_info: data?.server_info || null,
      base_url: base,
    });
  } catch (e) {
    const msg = e?.message || "Test failed";
    if (msg.includes("AbortError")) {
      return res.status(504).json({ ok: false, error: "Timeout contacting Xtream" });
    }
    return res.status(400).json({ ok: false, error: msg });
  }
});

export default router;
