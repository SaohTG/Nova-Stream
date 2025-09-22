// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

const ACCESS_TTL  = Number(process.env.API_JWT_ACCESS_TTL ?? 900);
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL ?? 1209600);
const COOKIE_SECURE   = String(process.env.COOKIE_SECURE) === "true";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || "lax").toLowerCase();

const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/* ============== bootstrap table ============== */
async function ensureUsers() {
  // crée la table si absente (pas de dépendance aux extensions)
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
     WHERE table_name='users' AND column_name = ANY($1::text[])`, [candidates]
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
function setRefreshCookie(res, token) {
  const sameSite = ["lax","strict","none"].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : "lax";
  res.cookie("rt", token, { httpOnly:true, secure:COOKIE_SECURE, sameSite, path:"/", maxAge: REFRESH_TTL*1000 });
}
function setAccessCookie(res, token) {
  const sameSite = ["lax","strict","none"].includes(COOKIE_SAMESITE) ? COOKIE_SAMESITE : "lax";
  res.cookie("at", token, { httpOnly:true, secure:COOKIE_SECURE, sameSite, path:"/", maxAge: ACCESS_TTL*1000 });
}

/* ============== DB helpers ============== */
async function getUserByEmail(email) {
  const col = await getPasswordColumn();
  const { rows } = await pool.query(
    `SELECT id, email, ${col} AS password FROM users WHERE email=$1 LIMIT 1`, [email]
  );
  return rows[0] || null;
}
async function createUser(email, passwordPlain) {
  const col = await getPasswordColumn();
  const id = randomUUID();                    // <- génère l'id ici
  const hash = await bcrypt.hash(passwordPlain, 10);
  const { rows } = await pool.query(
    `INSERT INTO users (id, email, "${col}") VALUES ($1,$2,$3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    [id, email, hash]
  );
  if (!rows.length) {
    // email déjà utilisé
    const existing = await getUserByEmail(email);
    if (existing) throw Object.assign(new Error("Email already used"), { status:409 });
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
  if (!token && req.cookies?.at) token = req.cookies.at;
  if (!token) return res.status(401).json({ message: "No token" });
  try { req.user = jwt.verify(token, process.env.API_JWT_SECRET); return next(); }
  catch { return res.status(401).json({ message: "Invalid token" }); }
}
function ensureAuthOrRefresh(req, res, next) {
  const h = req.headers.authorization || "";
  let token = null;
  if (h.startsWith("Bearer ")) token = h.split(" ")[1];
  if (!token && req.cookies?.at) token = req.cookies.at;
  if (token) {
    try { req.user = jwt.verify(token, process.env.API_JWT_SECRET); return next(); }
    catch { /* try refresh */ }
  }
  const rt = req.cookies?.rt || req.cookies?.refresh_token || req.cookies?.ns_refresh;
  if (!rt) return res.status(401).json({ message: "Unauthorized" });
  try {
    const payload = jwt.verify(rt, process.env.API_REFRESH_SECRET);
    const { accessToken, refreshToken } = signTokens({ sub: payload.sub, email: payload.email });
    setRefreshCookie(res, refreshToken);
    setAccessCookie(res, accessToken);
    req.user = { sub: payload.sub, email: payload.email };
    return next();
  } catch {
    return res.status(401).json({ message: "Unauthorized" });
  }
}

/* ============== Routes ============== */
router.post("/signup", ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });
  await ensureUsers();
  if (await getUserByEmail(email)) return res.status(409).json({ message: "Email already used" });

  const user = await createUser(email, password);
  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  res.status(201).json({ accessToken });
}));

router.post("/login", ah(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });
  const user = await validateUser(email, password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  res.json({ accessToken });
}));

router.post("/refresh", ah(async (req, res) => {
  const token = req.cookies?.rt || req.cookies?.refresh_token || req.cookies?.ns_refresh;
  if (!token) return res.status(401).json({ message: "No refresh cookie" });
  const payload = jwt.verify(token, process.env.API_REFRESH_SECRET);
  const { accessToken, refreshToken } = signTokens({ sub: payload.sub, email: payload.email });
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  res.json({ accessToken });
}));

router.get("/me", ensureAuthOrRefresh, (req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(req.user);
});

export default router;
