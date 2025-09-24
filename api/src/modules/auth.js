// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const ACCESS_TTL  = Number(process.env.API_JWT_ACCESS_TTL ?? 900);        // seconds
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL ?? 1209600);   // seconds

const COOKIE_SECURE    = String(process.env.COOKIE_SECURE) === "true";
const COOKIE_SAMESITE  = (process.env.COOKIE_SAMESITE || "none").toLowerCase(); // default none pour cross-site
const COOKIE_DOMAIN    = process.env.COOKIE_DOMAIN || undefined;

// Par défaut, utilise access/refresh
const COOKIE_NAME_AT   = process.env.COOKIE_NAME_AT || "access";
const COOKIE_NAME_RT   = process.env.COOKIE_NAME_RT || "refresh";
// Duplique toujours en "access"/"refresh" pour compat requireAccess
const COOKIE_COMPAT    = String(process.env.COOKIE_COMPAT ?? "true") === "true";

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ============== bootstrap table ============== */
async function ensureUsers() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY,
      email text UNIQUE NOT NULL,
      password text,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
}

/* ============== password column autodetect ============== */
let PASSWORD_COL;
async function getPasswordColumn() {
  if (PASSWORD_COL) return PASSWORD_COL;
  await ensureUsers();
  const candidates = ["password","password_hash","hashed_password","pass"];
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name='users' AND column_name = ANY($1::text[])`,
    [candidates]
  );
  if (rows.length) {
    PASSWORD_COL = rows[0].column_name;
    console.log(`[AUTH] Using users.${PASSWORD_COL}`);
    return PASSWORD_COL;
  }
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password text`);
  PASSWORD_COL = "password";
  console.warn(`[AUTH] Created users.password`);
  return PASSWORD_COL;
}

/* ============== JWT helpers ============== */
function signTokens(payload) {
  const accessToken  = jwt.sign(payload, process.env.API_JWT_SECRET,     { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, process.env.API_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}

function normalizeSameSite(v) {
  return ["lax","strict","none"].includes(v) ? v : "none";
}
function cookieBase(maxAgeMs) {
  const base = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: normalizeSameSite(COOKIE_SAMESITE),
    path: "/",
    maxAge: maxAgeMs,
  };
  if (COOKIE_DOMAIN) base.domain = COOKIE_DOMAIN;
  return base;
}
function setAccessCookie(res, token) {
  const opt = cookieBase(ACCESS_TTL * 1000);
  res.cookie(COOKIE_NAME_AT, token, opt);
  // compat requireAccess
  if (COOKIE_COMPAT || COOKIE_NAME_AT !== "access") res.cookie("access", token, opt);
}
function setRefreshCookie(res, token) {
  const opt = cookieBase(REFRESH_TTL * 1000);
  res.cookie(COOKIE_NAME_RT, token, opt);
  // compat requireAccess
  if (COOKIE_COMPAT || COOKIE_NAME_RT !== "refresh") res.cookie("refresh", token, opt);
}
function clearAuthCookies(res) {
  const opt = cookieBase(0);
  res.clearCookie(COOKIE_NAME_AT, opt);
  res.clearCookie(COOKIE_NAME_RT, opt);
  res.clearCookie("access", opt);
  res.clearCookie("refresh", opt);
}

/* ============== DB helpers ============== */
async function getUserByEmail(email) {
  const col = await getPasswordColumn();
  const { rows } = await pool.query(
    `SELECT id, email, "${col}" AS password FROM users WHERE email=$1 LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}
async function createUser(email, passwordPlain) {
  const col = await getPasswordColumn();
  const id = randomUUID();
  const hash = await bcrypt.hash(passwordPlain, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, "${col}") VALUES ($1,$2,$3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [id, email, hash]
  );
  if (!rows.length) {
    const existing = await getUserByEmail(email);
    if (existing) throw Object.assign(new Error("Email already used"), { status: 409 });
  }
  return rows[0];
}
async function validateUser(email, passwordPlain) {
  const u = await getUserByEmail(email);
  if (!u || !u.password) return null;
  const ok = await bcrypt.compare(passwordPlain, u.password);
  return ok ? { id: u.id, email: u.email } : null;
}

/* ============== Auth middlewares ============== */
export function ensureAuth(req, res, next) {
  const h = req.headers.authorization || "";
  let token = null;
  if (h.startsWith("Bearer ")) token = h.split(" ")[1];
  if (!token &
