// api/src/modules/auth.js
import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { pool } from "../db/index.js";

const router = express.Router();

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL || 900);           // 15 min
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL || 1209600);     // 14 j
const ACCESS_SECRET = process.env.API_JWT_SECRET || "dev_access_secret";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "dev_refresh_secret";

function signAccess(userId) {
  return jwt.sign({ sub: userId, type: "access" }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}
function signRefresh(userId) {
  return jwt.sign({ sub: userId, type: "refresh" }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}
function setAuthCookies(res, access, refresh) {
  const base = { httpOnly: true, sameSite: "lax", secure: false, path: "/" };
  res.cookie("access_token", access, { ...base, maxAge: ACCESS_TTL * 1000 });
  res.cookie("refresh_token", refresh, { ...base, maxAge: REFRESH_TTL * 1000 });
}
function clearAuthCookies(res) {
  res.clearCookie("access_token", { path: "/" });
  res.clearCookie("refresh_token", { path: "/" });
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Création de table **sans** extension ni DEFAULT uuid DB
async function ensureUsersTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

router.post("/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!emailRe.test(String(email || ""))) return res.status(400).json({ error: "Email invalide" });
    if (!password || String(password).length < 6) return res.status(400).json({ error: "Mot de passe trop court" });

    await ensureUsersTable();

    const hash = await bcrypt.hash(String(password), 10);
    const id = crypto.randomUUID();
    const emailLower = String(email).toLowerCase();

    const { rows } = await pool.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1,$2,$3) RETURNING id, email, created_at",
      [id, emailLower, hash]
    );
    const user = rows[0];

    const access = signAccess(user.id);
    const refresh = signRefresh(user.id);
    setAuthCookies(res, access, refresh);

    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error("signup error:", e);
    if (e?.code === "23505") return res.status(409).json({ error: "Email déjà utilisé" });
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe requis" });

    await ensureUsersTable();

    const { rows } = await pool.query("SELECT id, email, password_hash FROM users WHERE email=$1", [
      String(email).toLowerCase(),
    ]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "Identifiants invalides" });

    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Identifiants invalides" });

    const access = signAccess(user.id);
    const refresh = signRefresh(user.id);
    setAuthCookies(res, access, refresh);

    return res.json({ ok: true, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

router.post("/auth/logout", async (_req, res) => {
  clearAuthCookies(res);
  res.json({ ok: true });
});

router.post("/auth/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refresh_token;
    if (!token) return res.status(401).json({ error: "No refresh token" });
    const payload = jwt.verify(token, REFRESH_SECRET);
    if (!payload?.sub) return res.status(401).json({ error: "Invalid refresh token" });
    const access = signAccess(payload.sub);
    setAuthCookies(res, access, token); // conserve le même refresh
    res.json({ ok: true });
  } catch (e) {
    console.error("refresh error:", e);
    clearAuthCookies(res);
    res.status(401).json({ error: "Refresh expiré" });
  }
});

router.get("/auth/me", async (req, res) => {
  try {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: "No session" });
    const payload = jwt.verify(token, ACCESS_SECRET);
    const { rows } = await pool.query("SELECT id, email FROM users WHERE id=$1", [payload.sub]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: "User not found" });
    res.json({ ok: true, user });
  } catch (e) {
    console.error("me error:", e);
    res.status(401).json({ error: "Unauthorized" });
  }
});

export default router;
