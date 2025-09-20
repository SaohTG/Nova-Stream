// api/src/modules/auth.js
import { Router } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { Pool } from "pg";

const router = Router();

// ⚠️ Si tu as déjà un pool ailleurs, remplace par ton import existant
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false } // si besoin en prod
});

const ACCESS_TTL = Number(process.env.API_JWT_ACCESS_TTL || 900);        // 15 min
const REFRESH_TTL = Number(process.env.API_JWT_REFRESH_TTL || 1209600);  // 14 j
const COOKIE_SECURE = String(process.env.COOKIE_SECURE) === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "lax";

function signTokens(payload) {
  const accessToken = jwt.sign(payload, process.env.API_JWT_SECRET, { expiresIn: ACCESS_TTL });
  const refreshToken = jwt.sign(payload, process.env.API_REFRESH_SECRET, { expiresIn: REFRESH_TTL });
  return { accessToken, refreshToken };
}
function setRefreshCookie(res, token) {
  res.cookie("rt", token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,  // 'lax' en dev HTTP ; 'none' + secure:true en HTTPS cross-site
    path: "/auth/refresh",
    maxAge: REFRESH_TTL * 1000,
  });
}

// --- DB helpers (adapte aux noms de tes colonnes)
async function getUserByEmail(email) {
  const { rows } = await pool.query(`SELECT id, email, password FROM users WHERE email=$1 LIMIT 1`, [email]);
  return rows[0] || null;
}
async function createUser(email, password) {
  const hash = await bcrypt.hash(password, 10);
  // id a un DEFAULT gen_random_uuid() (voir SQL d’init)
  const { rows } = await pool.query(
    `INSERT INTO users (email, password) VALUES ($1,$2) RETURNING id, email`,
    [email, hash]
  );
  return rows[0];
}
async function validateUser(email, password) {
  const u = await getUserByEmail(email);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.password);
  if (!ok) return null;
  return { id: u.id, email: u.email };
}

// --- Middleware access JWT (Bearer)
export function ensureAuth(req, res, next) {
  const h = req.headers.authorization || "";
  const [, token] = h.split(" ");
  if (!token) return res.status(401).json({ message: "No token" });
  try {
    req.user = jwt.verify(token, process.env.API_JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// --- Routes
router.post("/signup", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });

  const exists = await getUserByEmail(email);
  if (exists) return res.status(409).json({ message: "Email already used" });

  const user = await createUser(email, password);
  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  return res.status(201).json({ accessToken });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ message: "email/password required" });

  const user = await validateUser(email, password);
  if (!user) return res.status(401).json({ message: "Invalid credentials" });

  const { accessToken, refreshToken } = signTokens({ sub: user.id, email: user.email });
  setRefreshCookie(res, refreshToken);
  return res.json({ accessToken });
});

router.post("/refresh", async (req, res) => {
  const token = req.cookies && req.cookies.rt;
  if (!token) return res.status(401).json({ message: "No refresh cookie" });
  try {
    const payload = jwt.verify(token, process.env.API_REFRESH_SECRET);
    const { accessToken, refreshToken } = signTokens({ sub: payload.sub, email: payload.email });
    setRefreshCookie(res, refreshToken); // rotation
    return res.json({ accessToken });
  } catch {
    return res.status(401).json({ message: "Invalid refresh" });
  }
});

router.get("/me", ensureAuth, (req, res) => {
  return res.json(req.user);
});

export default router;
