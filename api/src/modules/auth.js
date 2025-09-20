// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL || 900);
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL || 1209600);
const COOKIE_SECURE = String(process.env.COOKIE_SECURE) === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "lax";

// util: wrapper async pour propager les erreurs à l’error middleware
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function signTokens(payload) {
  const accessToken  = jwt.sign(payload, process.env.API_JWT_SECRET,  { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, process.env.API_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}
function setRefreshCookie(res, token) {
  res.cookie("rt", token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE, // 'none' + secure:true en prod HTTPS cross-site
    path: "/auth/refresh",
    maxAge: REFRESH_TTL * 1000,
  });
}

// DB helpers (avec try/catch -> throw pour passer au middleware d’erreur)
async function getUserByEmail(email) {
  try {
    const { rows } = await pool.query(`SELECT id, email, password FROM users WHERE email=$1 LIMIT 1`, [email]);
    return rows[0] || null;
  } catch (e) {
    e.status = 500; throw e;
  }
}
async function createUser(email, password) {
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password) VALUES ($1,$2) RETURNING id, email`,
      [email, hash]
    );
    return rows[0];
  } catch (e) {
    e.status = 500; throw e;
  }
}
async function validateUser(email, password) {
  const u = await getUserByEmail(email);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.password);
  return ok ? { id: u.id, email: u.email } : null;
}

// Access guard (Bearer)
export function ensureAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const [, token] = h.split(" ");
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    req.user = jwt.verify(token, process.env.API_JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

// Routes (toutes wrappées avec ah)
router.post("/signup", ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });

  const exists = await getUserByEmail(email);
  if (exists) return res.status(409).json({ message: "Email already used" });

  const user = await createUser(email, password);
  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken });
}));

router.post("/login", ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });

  const user = await validateUser(email, password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  res.json({ accessToken });
}));

router.post("/refresh", ah(async (req, res) => {
  const token = req.cookies && req.cookies.rt;
  if (!token) return res.status(401).json({ message: "No refresh cookie" });

  const payload = jwt.verify(token, process.env.API_REFRESH_SECRET);
  const { accessToken, refreshToken } = signTokens({ sub: payload.sub, email: payload.email });
  setRefreshCookie(res, refreshToken); // rotation
  res.json({ accessToken });
}));

router.get("/me", ensureAuth, ah(async (req, res) => {
  res.json(req.user);
}));

export default router;
