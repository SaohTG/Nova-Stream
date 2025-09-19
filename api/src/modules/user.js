// api/src/modules/user.js
import express from "express";
import { pool } from "../db/index.js";
import { encrypt } from "../lib/crypto.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";

const router = express.Router();

/* ----------------------------- Helpers ----------------------------- */

async function ensureXtreamTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xtream_links (
      user_id UUID PRIMARY KEY,
      host TEXT NOT NULL,
      port INTEGER,
      username_enc TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_xtream_links_user ON xtream_links(user_id);
  `);
}

function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("host requis");
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;

  let url;
  try {
    url = new URL(h);
  } catch {
    throw new Error("host invalide");
  }

  const p = port ? parseInt(String(port), 10) : null;
  if (p && Number.isFinite(p) && p > 0) url.port = String(p);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

async function httpGetJson(url, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json,*/*" } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`HTTP ${r.status}`);
      err.status = r.status;
      err.body = text;
      throw err;
    }
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      if (!txt || txt === "null") return null;
      const err = new Error("Réponse JSON invalide depuis Xtream");
      err.status = 502;
      err.body = txt.slice(0, 300);
      throw err;
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error("Xtream a mis trop de temps à répondre");
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/* ------------------------------ Routes ----------------------------- */

/**
 * POST /user/link-xtream
 * body: { host, port?, username, password }
 * Auth requise (cookies JWT)
 */
router.post("/user/link-xtream", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    await ensureXtreamTable();

    const { host, port, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, error: "host, username, password requis" });
    }

    const key = process.env.API_ENCRYPTION_KEY;
    if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
      return res.status(400).json({ ok: false, error: "API_ENCRYPTION_KEY invalide (64 hex requis)" });
    }

    const base = buildBaseUrl(host, port);
    const testUrl = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

    let data;
    try {
      data = await httpGetJson(testUrl, Number(process.env.XTREAM_TIMEOUT_MS || 10000));
    } catch (e) {
      const code = e?.status || 502;
      return res.status(code).json({ ok: false, error: e.message || "Echec de test Xtream" });
    }

    const status =
      data?.user_info?.status ||
      data?.user_info?.auth ||
      data?.user_info?.is_trial ||
      data?.user_info ||
      null;

    const ok =
      String(status).toLowerCase() === "active" ||
      String(status).toLowerCase() === "true" ||
      status === 1 ||
      data?.user_info?.auth === 1;

    if (!ok) {
      return res.status(400).json({ ok: false, error: "Identifiants Xtream invalides", status });
    }

    const username_enc = await encrypt(String(username), key);
    const password_enc = await encrypt(String(password), key);

    await pool.query(
      `INSERT INTO xtream_links (user_id, host, port, username_enc, password_enc)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
       SET host=$2, port=$3, username_enc=$4, password_enc=$5, updated_at=now()`,
      [userId, host, port ? parseInt(port, 10) : null, username_enc, password_enc]
    );

    return res.json({ ok: true, linked: true });
  } catch (e) {
    console.error("[link-xtream] error:", e);
    const code = e?.status || (String(e?.message || "").includes("unauthorized") ? 401 : 500);
    return res.status(code).json({ ok: false, error: e?.message || "Erreur de liaison" });
  }
});

/**
 * GET /user/xtream-credentials
 * Renvoie host/port (pas les secrets) si lié
 */
router.get("/user/xtream-credentials", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    await ensureXtreamTable();

    const { rows } = await pool.query(
      "SELECT host, port FROM xtream_links WHERE user_id=$1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, linked: false });

    return res.json({ ok: true, linked: true, host: rows[0].host, port: rows[0].port ?? null });
  } catch (e) {
    const code = e?.status || 500;
    return res.status(code).json({ ok: false, error: e?.message || "Erreur" });
  }
});

/**
 * GET /user/has-xtream
 * Indique simplement si un lien Xtream existe pour l'utilisateur
 */
router.get("/user/has-xtream", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    await ensureXtreamTable();

    const { rows } = await pool.query(
      "SELECT 1 FROM xtream_links WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    return res.json({ ok: true, linked: rows.length > 0 });
  } catch (e) {
    const code = e?.status || 500;
    return res.status(code).json({ ok: false, error: e?.message || "Erreur" });
  }
});

export default router;
