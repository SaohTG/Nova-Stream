// api/src/modules/auth.js (ESM)
import express from "express";
import { pool } from "../db/index.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = express.Router();

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL || 900);
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL || 60 * 60 * 24 * 14);
const ACCESS_SECRET = process.env.API_JWT_SECRET || "dev_access_secret";
const REFRESH_SECRET = process.env.API_REFRESH_SECRET || "dev_refresh_secret";

function signAccess(userId) {
  return jwt.sign({ sub: userId, type: "access" }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}
function signRefresh(userId) {
  return jwt.sign({ sub: userId, type: "refresh" }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}
function setAuthCookies(res, access, refresh) {
  const common = { httpOnly: true, sameSite: "lax", secure: false, path: "/" };
  res.cookie("access_token", access, { ...common, maxAge: ACCESS_TTL * 1000 });
  res.cookie("refresh_token", refresh, { ...common, maxAge: REFRESH_TTL * 1000 });
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post("/auth/signup", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
    if (!emailRe.test(String(email))) return res.status(400).json({ error: "Invalid email" });
    if (String(password).length < 6) return res.status(400).json({ error: "Password too short" });

    const hash = await bcrypt.hash(String(password), 10);
    const ins = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1,$2)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email`,
      [String(email).toLowerCase(), hash]
    );
    if (!ins.rowCount) return res.status(409).json({ error: "Email already registered" });

    const user = ins.rows[0];
    setAuthCookies(res, signAccess(user.id), signRefresh(user.id));
    return res.status(201).json({ id: user.id, email: user.email });
  } catch (e) {
    console.error("signup error:", e);
    return res.status(500).json({ error: "Signup failed" });
  }
});

router.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const sel = await pool.query("SELECT id, email, password_hash FROM users WHERE email=$1", [
      String(email).toLowerCase(),
    ]);
    if (!sel.rowCount) return res.status(401).json({ error: "Invalid credentials" });

    const user = sel.rows[0];
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    setAuthCookies(res, signAccess(user.id), signRefresh(user.id));
    return res.json({ id: user.id, email: user.email });
  } catch (e) {
    console.error("login error:", e);
    return res.status(500).json({ error: "Login failed" });
  }
});

router.post("/auth/logout", (_req, res) => {
  const past = new Date(0);
  const opts = { httpOnly: true, sameSite: "lax", secure: false, path: "/", expires: past };
  res.cookie("access_token", "", opts);
  res.cookie("refresh_token", "", opts);
  return res.json({ ok: true });
});

router.get("/auth/me", (req, res) => {
  try {
    const token = req.cookies?.access_token;
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    const payload = jwt.verify(token, ACCESS_SECRET);
    return res.json({ userId: payload.sub });
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
});

export default router;
