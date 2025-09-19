// api/src/modules/user.js (ESM)
import express from "express";
import { pool } from "../db/index.js";
import { requireAuthUserId, resolveUserParam } from "../middleware/resolveMe.js";
import { encrypt /* , decrypt */ } from "../lib/crypto.js";

function asInt(v, fallback = null) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseHostPortFromInput(inputHost, inputPort) {
  const rawHost = (inputHost ?? "").toString().trim();
  const rawPort = inputPort ?? null;

  if (!rawHost) throw Object.assign(new Error("Missing host"), { status: 400 });

  if (/^https?:\/\//i.test(rawHost)) {
    let u;
    try {
      u = new URL(rawHost);
    } catch {
      throw Object.assign(new Error("Invalid host URL"), { status: 400 });
    }
    if (rawPort && !u.port) u.port = String(parseInt(rawPort, 10));
    const port = u.port ? parseInt(u.port, 10) : (u.protocol === "https:" ? 443 : 80);
    if (!Number.isFinite(port) || port <= 0) {
      throw Object.assign(new Error("Invalid port"), { status: 400 });
    }
    return { host: u.hostname, port };
  }

  const p = rawPort ? parseInt(rawPort, 10) : 80;
  if (!Number.isFinite(p) || p <= 0) {
    throw Object.assign(new Error("Invalid port"), { status: 400 });
  }
  return { host: rawHost, port: p };
}

export async function getXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req);
    const { rows } = await pool.query(
      "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id = $1",
      [userId]
    );
    if (!rows.length) return res.json(null);
    const row = rows[0];
    return res.json({
      host: row.host,
      port: row.port,
      hasCredentials: Boolean(row.username_enc && row.password_enc),
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Error" });
  }
}

export async function upsertXtreamLink(req, res) {
  try {
    const userId = requireAuthUserId(req);

    const body = req.body || {};
    const host = body.host ?? body.xtreamHost ?? body.server ?? body.hostname;
    const port = body.port ?? body.xtreamPort;
    const username = body.username ?? body.user ?? body.login;
    const password = body.password ?? body.pass ?? body.pwd;

    if (!host || !username || !password) {
      return res.status(400).json({
        error: "Missing fields",
        required: ["host", "(port optional)", "username", "password"],
        received: Object.keys(body),
      });
    }

    const { host: normalizedHost, port: normalizedPort } = parseHostPortFromInput(host, port);

    const key = process.env.API_ENCRYPTION_KEY;
    if (!key || key.length !== 64) {
      return res.status(500).json({
        error: "Invalid API_ENCRYPTION_KEY (must be 64 hex chars)",
      });
    }

    const usernameEnc = await encrypt(String(username), key);
    const passwordEnc = await encrypt(String(password), key);

    await pool.query(
      `INSERT INTO xtream_links (user_id, host, port, username_enc, password_enc)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id)
       DO UPDATE SET host=EXCLUDED.host,
                     port=EXCLUDED.port,
                     username_enc=EXCLUDED.username_enc,
                     password_enc=EXCLUDED.password_enc,
                     updated_at=now()`,
      [userId, normalizedHost, normalizedPort, usernameEnc, passwordEnc]
    );

    return res.json({ ok: true });
  } catch (e) {
    return res.status(e.status || 500).json({ error: e.message || "Error" });
  }
}

// Router (export default)
const userRouter = express.Router();
userRouter.param("id", resolveUserParam("id"));

userRouter.get("/user/:id/xtream/link", (req, res) => getXtreamLink(req, res));
userRouter.post("/user/:id/xtream/link", (req, res) => upsertXtreamLink(req, res));

// Alias compat front
userRouter.get("/user/xtream/link", (req, res) => getXtreamLink(req, res));
userRouter.post("/user/link-xtream", (req, res) => upsertXtreamLink(req, res));

export default userRouter;
