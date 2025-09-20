// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { pool } from "../db/index.js";
import { getDatabaseUuidSupport } from "../db/init.js";

const authRouter = Router();

/* ------------------- Helpers ------------------- */

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL || 900);        // 15 min
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL || 1209600);  // 14 jours
const ACCESS_SECRET = process.env.API_JWT_SECRET || "Y7dD6Vh2mC4pQ8tR1sX9zK3wL5aN0fB2gU4hJ6iO8lT1qP3dV";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "mZ2xL7nH3qK9tC8vS4pD0rG6yB1wF5aE7uJ9hQ3oN2lM4kR8";

const COOKIE_SECURE = (process.env.NODE_ENV || "development") === "production";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "lax"; // "lax" suffisant en même-site (IP:port)
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined; // laisse vide si IP

function setAuthCookies(res, { accessToken, refreshToken }) {
  res.cookie("nova_access", accessToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: ACCESS_TTL * 1000,
  });
  res.cookie("nova_refresh", refreshToken, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    path: "/",
    domain: COOKIE_DOMAIN,
    maxAge: REFRESH_TTL * 1000,
  });
}

function clearAuthCookies(res) {
  res.clearCookie("nova_access", { path: "/" });
  res.clearCookie("nova_refresh", { path: "/" });
}

function signAccess(userId) {
  return jwt.sign({ sub: userId }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}
function signRefresh(userId) {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function ensureAuth(req, res, next) {
  try {
    const token = req.cookies?.nova_access;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, ACCESS_SECRET);
    req.user = { id: payload.sub };
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

/* ------------------- Routes ------------------- */

// POST /auth/signup { email, password }
authRouter.post("/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email et password requis" });

    // Vérifie existence
    const exists = await pool.query("SELECT id FROM users WHERE email = $1 LIMIT 1", [email]);
    if (exists.rowCount > 0) return res.status(409).json({ error: "email déjà utilisé" });

    const hash = await bcrypt.hash(password, 10);

    // Generate user ID based on database capability
    let userId;
    if (getDatabaseUuidSupport()) {
      try {
        // Database can generate UUIDs, let it handle the ID
        const q = "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id::text AS id";
        const { rows } = await pool.query(q, [email, hash]);
        if (rows[0].id) {
          userId = rows[0].id;
        } else {
          throw new Error("Database returned null UUID");
        }
      } catch (dbError) {
        console.warn("Database UUID generation failed, falling back to application level:", dbError.message);
        // Fall back to application-level generation
        const generatedId = randomUUID();
        const q = "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id::text AS id";
        const { rows } = await pool.query(q, [generatedId, email, hash]);
        userId = rows[0].id;
      }
    } else {
      // Generate UUID in application
      const generatedId = randomUUID();
      const q = "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id::text AS id";
      const { rows } = await pool.query(q, [generatedId, email, hash]);
      userId = rows[0].id;
    }

    const accessToken = signAccess(userId);
    const refreshToken = signRefresh(userId);
    setAuthCookies(res, { accessToken, refreshToken });

    return res.status(201).json({ ok: true, user_id: userId });
  } catch (e) {
    console.error("signup error:", e);
    return res.status(500).json({ error: "signup failed" });
  }
});

// POST /auth/login { email, password }
authRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "email et password requis" });

    const q = "SELECT id::text AS id, password_hash FROM users WHERE email=$1 LIMIT 1";
    const { rows } = await pool.query(q, [email]);
    if (rows.length === 0) return res.status(401).json({ error: "credentials invalides" });

    const ok = await bcrypt.compare(password, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: "credentials invalides" });

    const userId = rows[0].id;
    const accessToken = signAccess(userId);
    const refreshToken = signRefresh(userId);
    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ ok: true, user_id: userId });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ error: "login failed" });
  }
});

// POST /auth/refresh
authRouter.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.nova_refresh;
    if (!token) return res.status(401).json({ error: "no refresh" });
    const payload = jwt.verify(token, REFRESH_SECRET);
    const userId = payload.sub;

    const accessToken = signAccess(userId);
    const refreshToken = signRefresh(userId);
    setAuthCookies(res, { accessToken, refreshToken });

    return res.json({ ok: true });
  } catch (e) {
    console.error("refresh error:", e);
    clearAuthCookies(res);
    return res.status(401).json({ error: "refresh failed" });
  }
});

// POST /auth/logout
authRouter.post("/logout", (req, res) => {
  clearAuthCookies(res);
  return res.json({ ok: true });
});

// GET /auth/me
authRouter.get("/me", ensureAuth, async (req, res) => {
  try {
    const userId = req.userId;
    const q = "SELECT id::text AS id, email FROM users WHERE id=$1 LIMIT 1";
    const { rows } = await pool.query(q, [userId]);
    if (rows.length === 0) return res.status(404).json({ error: "user not found" });
    return res.json({ id: rows[0].id, email: rows[0].email });
  } catch (e) {
    console.error("me error:", e);
    return res.status(500).json({ error: "me failed" });
  }
});

export default authRouter;
