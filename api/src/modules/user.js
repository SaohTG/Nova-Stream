// api/src/modules/user.js
// ESM uniquement (package.json: "type":"module")
import express from "express";
import { pool } from "../db/index.js";
import { requireAuthUserId, resolveUserParam } from "../middleware/resolveMe.js";
import { encrypt /* , decrypt */ } from "../lib/crypto.js";

/**
 * Helpers
 */
function asInt(v, fallback = null) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function badRequest(res, msg = "Bad Request") {
  return res.status(400).json({ error: msg });
}

/**
 * GET /user/:id/xtream/link
 * GET /user/xtream/link
 * Récupère le lien Xtream (host, port) du user courant (UUID via JWT).
 * Ne renvoie jamais les secrets en clair.
 */
export async function getXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req); // ✅ UUID depuis le JWT

    const { rows } = await pool.query(
      "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id = $1",
      [userId]
    );

    if (!rows.length) return res.json(null);

    const row = rows[0];
    // On ne retourne pas les credentials chiffrés au front.
    return res.json({
      host: row.host,
      port: row.port,
      hasCredentials: Boolean(row.username_enc && row.password_enc),
    });
  } catch (e) {
    const code = e.status || 500;
    return res.status(code).json({ error: e.message || "Error" });
  }
}

/**
 * POST /user/:id/xtream/link
 * POST /user/link-xtream   (alias compat front)
 * Body JSON attendu: { host, port, username, password }
 * Stocke/Met à jour le lien Xtream pour l'utilisateur courant (UUID via JWT).
 * username/password sont chiffrés (AES-256-GCM) avec API_ENCRYPTION_KEY.
 */
export async function upsertXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req); // ✅ ignore totalement req.params.id

    const { host, port, username, password } = req.body || {};

    if (!host || !port || !username || !password) {
      return badRequest(res, "Missing fields (host, port, username, password)");
    }

    const key = process.env.API_ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
      return res
        .status(500)
        .json({ error: "Invalid API_ENCRYPTION_KEY (must be 64 hex chars)" });
    }

    const normalizedHost = String(host).trim();
    const normalizedPort = asInt(port);
    if (!normalizedHost) return badRequest(res, "Invalid host");
    if (!normalizedPort) return badRequest(res, "Invalid port");

    const usernameEnc = await encrypt(String(username), key);
    const passwordEnc = await encrypt(String(password), key);

    await pool.query(
      `INSERT INTO xtream_links (user_id, host, port, username_enc, password_enc)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id)
       DO UPDATE SET host = EXCLUDED.host,
                     port = EXCLUDED.port,
                     username_enc = EXCLUDED.username_enc,
                     password_enc = EXCLUDED.password_enc,
                     updated_at = now()`,
      [userId, normalizedHost, normalizedPort, usernameEnc, passwordEnc]
    );

    return res.json({ ok: true });
  } catch (e) {
    const code = e.status || 500;
    return res.status(code).json({ error: e.message || "Error" });
  }
}

/**
 * Router par défaut (attendu par main.js via import default)
 * Expose à la fois les routes "propres" et les alias de compat avec le front.
 */
const userRouter = express.Router();

// Si tu utilises encore /user/:id/... et que :id peut être "me"
userRouter.param("id", resolveUserParam("id"));

// Routes "propres" (conservent la compat :id si utilisé)
userRouter.get("/user/:id/xtream/link", (req, res) => getXtreamLink(req, res));
userRouter.post("/user/:id/xtream/link", (req, res) => upsertXtreamLink(req, res));

// ✅ Alias compat front (évite le 404 sur /user/link-xtream et GET /user/xtream/link)
userRouter.get("/user/xtream/link", (req, res) => getXtreamLink(req, res));
userRouter.post("/user/link-xtream", (req, res) => upsertXtreamLink(req, res));

export default userRouter;
