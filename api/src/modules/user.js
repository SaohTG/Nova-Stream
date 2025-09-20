import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("API_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  }
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

router.post("/link-xtream", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    const { baseUrl, username, password } = req.body || {};
    if (!baseUrl || !username || !password) return res.status(400).json({ message: "baseUrl/username/password required" });

    let url = String(baseUrl).trim();
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`;

    await ensureTable();
    await pool.query(
      `INSERT INTO user_xtream (user_id, base_url, username_enc, password_enc)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (user_id) DO UPDATE
         SET base_url=EXCLUDED.base_url,
             username_enc=EXCLUDED.username_enc,
             password_enc=EXCLUDED.password_enc,
             updated_at=now();`,
      [req.user.sub, url, enc(username), enc(password)]
    );

    res.json({ ok: true });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

router.get("/xtream", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    const { rows } = await pool.query(
      `SELECT base_url, username_enc FROM user_xtream WHERE user_id=$1`, [req.user.sub]
    );
    if (!rows.length) return res.json({ linked: false });
    return res.json({ linked: true, baseUrl: rows[0].base_url });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

export default router;
