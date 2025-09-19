// api/src/modules/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { pool } from "../db/index.js";

const router = express.Router();

/* --------------------------- Config & helpers --------------------------- */

const ACCESS_TTL_SEC = Number(process.env.API_JWT_ACCESS_TTL || 900);        // 15 min
const REFRESH_TTL_SEC = Number(process.env.API_JWT_REFRESH_TTL || 1209600);  // 14 jours

const ACCESS_SECRET = process.env.API_JWT_SECRET || "dev_access_secret_change_me";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "dev_refresh_secret_change_me";

// Pour Portainer en HTTP: COOKIE_SECURE=false, COOKIE_SAMESITE=lax
function cookieBaseOptions() {
  const secure =
    process.env.COOKIE_SECURE === "true" ||
    (process.env.NODE_ENV === "production" && process.env.FORCE_SECURE_COOKIES === "true");

  return {
    httpOnly: true,
    secure, // si true → cookies seulement via HTTPS
    sameSite: (process.env.COOKIE_SAMESITE || "lax"),
    path: "/",
  };
}

function setAuthCookies(res, { accessToken, refreshToken }) {
  const accessOpts = {
    ...cookieBaseOptions(),
    maxAge: ACCESS_TTL_SEC * 1000,
  };
  const refreshOpts = {
    ...cookieBaseOptions(),
    maxAge: REFRESH_TTL_SEC * 1000,
  };

  // IMPORTANT: ne pas définir 'domain' pour une IP (host-only cookie)
  res.cookie("ns_access", accessToken, accessOpts);
  res.cookie("ns_refresh", refreshToken, refreshOpts);
}

function clearAuthCookies(res) {
  const base = cookieBaseOptions();
  res.clearCookie("ns_access", { ...base, maxAge: 0 });
  res.clearCookie("ns_refresh", { ...base, maxAge: 0 });
}

function signAccessToken(userId) {
  return jwt.sign({ sub: userId, typ: "access" }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL_SEC,
  });
}

function signRefreshToken(userId) {
  return jwt.sign({ sub: userId, typ: "refresh" }, REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_SEC,
  });
}

async function ensureUsersTable() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
  `);
}

/* ----------------------------- Middlewares ----------------------------- */

async function requireAccess(req, res, next) {
  try {
    const token = req.cookies?.ns_access;
    if (!token) return res.status(401).json({ ok: false, error: "unauthorized" });

    const payload = jwt.verify(token, ACCESS_SECRET);
    if (!payload?.sub) return res.status(401).json({ ok: false, error: "unauthorized" });

    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
}

/* -------------------------------- Routes -------------------------------- */

/**
 * POST /auth/signup
 * body: { email, password }
 */
router.post("/auth/signup", async (req, res) => {
  try {
    await ensureUsersTable();

    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email et password requis" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const pwdHash = await bcrypt.hash(String(password), 10);

    let userId;
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         ON CONFLICT (email) DO NOTHING
         RETURNING id`,
        [emailNorm, pwdHash]
      );
      if (!rows.length) {
        return res.status(409).json({ ok: false, error: "email déjà utilisé" });
      }
      userId = rows[0].id;
    } catch (e) {
      return res.status(500).json({ ok: false, error: e.message || "Erreur création utilisateur" });
    }

    const access = signAccessToken(userId);
    const refresh = signRefreshToken(userId);
    setAuthCookies(res, { accessToken: access, refreshToken: refresh });

    return res.json({ ok: true, user: { id: userId, email: emailNorm } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Erreur signup" });
  }
});

/**
 * POST /auth/login
 * body: { email, password }
 */
router.post("/auth/login", async (req, res) => {
  try {
    await ensureUsersTable();

    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "email et password requis" });
    }

    const emailNorm = String(email).trim().toLowerCase();
    const { rows } = await pool.query(
      "SELECT id, password_hash FROM users WHERE email=$1",
      [emailNorm]
    );

    if (!rows.length) {
      return res.status(401).json({ ok: false, error: "identifiants invalides" });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ ok: false, error: "identifiants invalides" });
    }

    const access = signAccessToken(user.id);
    const refresh = signRefreshToken(user.id);
    setAuthCookies(res, { accessToken: access, refreshToken: refresh });

    return res.json({ ok: true, user: { id: user.id, email: emailNorm } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Erreur login" });
  }
});

/**
 * POST /auth/refresh
 * Utilise le cookie ns_refresh pour émettre un nouvel access token.
 */
router.post("/auth/refresh", async (req, res) => {
  try {
    const refreshToken = req.cookies?.ns_refresh;
    if (!refreshToken) return res.status(401).json({ ok: false, error: "no refresh" });

    let payload;
    try {
      payload = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      return res.status(401).json({ ok: false, error: "refresh invalide" });
    }

    const userId = payload?.sub;
    if (!userId) return res.status(401).json({ ok: false, error: "refresh invalide" });

    const access = signAccessToken(userId);
    // (optionnel) on peut aussi régénérer un refresh
    const rotateRefresh = false;
    const newRefresh = rotateRefresh ? signRefreshToken(userId) : refreshToken;

    setAuthCookies(res, { accessToken: access, refreshToken: newRefresh });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Erreur refresh" });
  }
});

/**
 * POST /auth/logout
 * Efface les cookies.
 */
router.post("/auth/logout", async (_req, res) => {
  clearAuthCookies(res);
  return res.json({ ok: true });
});

/**
 * GET /auth/me
 * Retourne l’utilisateur courant (via access token).
 */
router.get("/auth/me", requireAccess, async (req, res) => {
  try {
    const userId = req.userId;
    const { rows } = await pool.query("SELECT id, email, created_at FROM users WHERE id=$1", [
      userId,
    ]);
    if (!rows.length) return res.status(404).json({ ok: false, error: "not found" });
    return res.json({ ok: true, user: rows[0] });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || "Erreur me" });
  }
});

export default router;
