// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL ?? 900);        // 15 min
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL ?? 1209600);  // 14 j
const COOKIE_SECURE = String(process.env.COOKIE_SECURE) === "true";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();

/** Async wrapper to forward errors to error middleware */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Detect the password column name or create one if none exists */
let PASSWORD_COL; // cache
async function getPasswordColumn() {
  if (PASSWORD_COL) return PASSWORD_COL;
  const candidates = ["password", "password_hash", "hashed_password", "pass"];
  const { rows } = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_name='users' AND column_name = ANY($1::text[])`,
    [candidates]
  );
  if (rows.length) {
    PASSWORD_COL = rows[0].column_name;
    console.log(`[AUTH] Using users.${PASSWORD_COL} for password`);
    return PASSWORD_COL;
  }
  // Fallback: create "password" column (text)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password text`);
  PASSWORD_COL = "password";
  console.warn(`[AUTH] No password-like column found. Created users.password (text).`);
  return PASSWORD_COL;
}

function signTokens(payload) {
  const accessToken  = jwt.sign(payload, process.env.API_JWT_SECRET,  { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, process.env.API_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}

function setRefreshCookie(res, token) {
  const sameSite = ["lax", "strict", "none"].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : "lax";
  res.cookie("rt", token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite,
    path: "/auth/refresh",
    maxAge: REFRESH_TTL * 1000,
  });
}

// --- DB helpers -------------------------------------------------------------
async function getUserByEmail(email) {
  const col = await getPasswordColumn();
  const sql = `SELECT id, email, ${col} AS password FROM users WHERE email=$1 LIMIT 1`;
  const { rows } = await pool.query(sql, [email]);
  return rows[0] || null;
}

async function createUser(email, passwordPlain) {
  const col = await getPasswordColumn();
  const hash = await bcrypt.hash(passwordPlain, 10);
  const sql = `INSERT INTO users (email, "${col}") VALUES ($1,$2) RETURNING id, email`;
  const { rows } = await pool.query(sql, [email, hash]);
  return rows[0];
}

async function validateUser(email, passwordPlain) {
  const u = await getUserByEmail(email);
  if (!u || !u.password) return null;
  const ok = await bcrypt.compare(passwordPlain, u.password);
  return ok ? { id: u.id, email: u.email } : null;
}

// --- Access guard (Bearer) --------------------------------------------------
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

// --- Routes -----------------------------------------------------------------
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
