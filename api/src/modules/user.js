// api/src/modules/user.js
import express from "express";
import { pool } from "../db/index.js";
import { requireAuthUserId, resolveUserParam } from "../middleware/resolveMe.js";
import { encrypt } from "../lib/crypto.js";

// --- Handlers (nommés) ---
export async function getXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req); // UUID depuis le JWT
    const { rows } = await pool.query(
      "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id = $1",
      [userId]
    );
    return res.json(rows[0] || null);
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Error" });
  }
}

export async function upsertXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req); // ignore totalement req.params.id
    const { host, port, username, password } = req.body || {};
    if (!host || !port || !username || !password) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const key = process.env.API_ENCRYPTION_KEY;
    if (!key) return res.status(500).json({ error: "Missing encryption key" });

    const usernameEnc = await encrypt(username, key);
    const passwordEnc = await encrypt(password, key);

    await pool.query(
      `INSERT INTO xtream_links (user_id, host, port, username_enc, password_enc)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id)
       DO UPDATE SET host=EXCLUDED.host,
                     port=EXCLUDED.port,
                     username_enc=EXCLUDED.username_enc,
                     password_enc=EXCLUDED.password_enc,
                     updated_at=now()`,
      [userId, host, port, usernameEnc, passwordEnc]
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Error" });
  }
}

// --- Router par défaut attendu par main.js ---
const userRouter = express.Router();

// Résoudre ":id" quand c'est "me" (facultatif si tu n'utilises plus le param)
userRouter.param("id", resolveUserParam("id"));

// Monte les routes
userRouter.get("/user/:id/xtream/link", (req, res) => getXtreamLink(req, res));
userRouter.post("/user/:id/xtream/link", (req, res) => upsertXtreamLink(req, res));

// Export par défaut (🔥 indispensable pour corriger l'erreur)
export default userRouter;
