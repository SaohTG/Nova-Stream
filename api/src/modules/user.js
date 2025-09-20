// api/src/modules/user.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ====== AES-256-GCM ====== */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return Buffer.from(hex, "hex");
}
function enc(plain) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

/* ====== Utils robustes ====== */
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
// Deep-scan pour trouver un champ par “intent” (url/user/pass)
function deepFind(obj, matchFn) {
  if (!obj || typeof obj !== "object") return undefined;
  for (const [k, v] of Object.entries(obj)) {
    if (matchFn(k, v)) return v;
    if (v && typeof v === "object") {
      const r = deepFind(v, matchFn);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}
function extractFields(body = {}) {
  // Sources directes
  let baseUrl = body.baseUrl || body.url || body.serverUrl || body.apiUrl || body.portal || body.endpoint;
  if (!baseUrl && body.host && body.port) baseUrl = `${body.host}:${body.port}`;
  let username = body.username || body.user || body.login || body.email || body.u;
  let password = body.password || body.pass || body.pwd || body.p;

  // Deep (si payload nested ou “data: { … }”)
  if (!baseUrl) {
    baseUrl = deepFind(body, (k, v) => /base|server|portal|endpoint|url/i.test(k) && typeof v === "string");
  }
  if (!username) {
    username = deepFind(body, (k, v) => /(user(name)?|login|email|u$)/i.test(k) && typeof v === "string");
  }
  if (!password) {
    password = deepFind(body, (k, v) => /(pass(word)?|pwd|p$)/i.test(k) && typeof v === "string");
  }

  baseUrl = normalizeBaseUrl(baseUrl);
  username = (username || "").toString().trim();
  password = (password || "").toString().trim();
  return { baseUrl, username, password };
}
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_xtream (
      user_id uuid PRIMARY KEY,
      base_url text NOT NULL,
      username_enc text NOT NULL,
      password_enc text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
}

/* ====== Routes ====== */
router.post("/link-xtream", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });

    const { baseUrl, username, password } = extractFields(req.body || {});
    const missing = [];
    if (!baseUrl) missing.push("baseUrl");
    if (!username) missing.push("username");
    if (!password) missing.push("password");
    if (missing.length) {
      return res.status(422).json({
        message: "Missing required fields",
        missing,
        received: { baseUrl: !!baseUrl, username: !!username, password: !!password },
        example: { baseUrl: "http://server:8080", username: "demo", password: "demo" },
      });
    }

    await ensureTable();
    await pool.query(
      `INSERT INTO user_xtream (user_id, base_url, username_enc, password_enc)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE
         SET base_url=EXCLUDED.base_url,
             username_enc=EXCLUDED.username_enc,
             password_enc=EXCLUDED.password_enc,
             updated_at=now();`,
      [req.user.sub, baseUrl, enc(username), enc(password)]
    );

    return res.json({ ok: true, baseUrl, username });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

router.get("/xtream", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    await ensureTable();
    const { rows } = await pool.query(
      `SELECT base_url FROM user_xtream WHERE user_id=$1`,
      [req.user.sub]
    );
    if (!rows.length) return res.json({ linked: false });
    return res.json({ linked: true, baseUrl: rows[0].base_url });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

export default router;
