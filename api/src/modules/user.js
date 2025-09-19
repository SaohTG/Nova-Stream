// api/src/modules/user.js (ESM)
import express from "express";
import { pool } from "../db/index.js";
import { encrypt } from "../lib/crypto.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";

const router = express.Router();

// Création idempotente de la table xtream_links
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

// GET /user/has-xtream → { ok:true, linked:boolean }
router.get("/user/has-xtream", async (req, res) => {
  try {
    const userId = requireAuthUserId(req);
    await ensureXtreamTable();
    const { rows } = await pool.query(
      "SELECT 1 FROM xtream_links WHERE user_id=$1 LIMIT 1",
      [userId]
    );
    res.json({ ok: true, linked: rows.length > 0 });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

// (optionnel pour debug UI) GET /user/xtream-credentials?mine=1 → renvoie seulement host/port (jamais les secrets)
router.get("/user/xtream-credentials", async (req, res) => {
  try {
    const userId = requireAuthUserId(req);
    await ensureXtreamTable();
    const { rows } = await pool.query(
      "SELECT host, port FROM xtream_links WHERE user_id=$1",
      [userId]
    );
    if (!rows.length) return res.status(404).json({ ok: false, error: "No link" });
    res.json({ ok: true, host: rows[0].host, port: rows[0].port ?? null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Server error" });
  }
});

// POST /user/link-xtream {host, port?, username, password}
router.post("/user/link-xtream", async (req, res) => {
  try {
    const userId = requireAuthUserId(req);
    const { host, port, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing host/username/password" });
    }

    const p = port ? parseInt(String(port), 10) : null;
    if (port && (!Number.isFinite(p) || p <= 0)) {
      return res.status(400).json({ ok: false, error: "Invalid port" });
    }

    const key = process.env.API_ENCRYPTION_KEY;
    if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
      return res.status(500).json({ ok: false, error: "Invalid API_ENCRYPTION_KEY (64 hex required)" });
    }

    await ensureXtreamTable();

    const username_enc = await encrypt(String(username), key);
    const password_enc = await encrypt(String(password), key);

    await pool.query(
      `INSERT INTO xtream_links (user_id, host, port, username_enc, password_enc)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id) DO UPDATE
       SET host=EXCLUDED.host,
           port=EXCLUDED.port,
           username_enc=EXCLUDED.username_enc,
           password_enc=EXCLUDED.password_enc,
           updated_at=now()`,
      [userId, String(host).trim(), p, username_enc, password_enc]
    );

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || "Link failed" });
  }
});

export default router;
