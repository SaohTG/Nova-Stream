// api/src/modules/xtream.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ============ AES-256-GCM ============ */
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars");
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
function dec(blob) {
  const [v, ivb64, tagb64, ctb64] = String(blob).split(":");
  if (v !== "v1") throw new Error("Unsupported enc version");
  const key = getKey();
  const iv = Buffer.from(ivb64, "base64");
  const tag = Buffer.from(tagb64, "base64");
  const ct = Buffer.from(ctb64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}

/* ============ Utils ============ */
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function mask(v = "") {
  if (!v) return "";
  if (v.length <= 2) return v;
  return `${v[0]}${"*".repeat(Math.max(1, v.length - 2))}${v.at(-1)}`;
}
async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xtream_accounts (
      user_id uuid PRIMARY KEY,
      base_url text NOT NULL,
      username_enc text NOT NULL,
      password_enc text NOT NULL,
      created_at timestamptz DEFAULT now(),
      updated_at timestamptz DEFAULT now()
    );
  `);
}
async function getCreds(userId) {
  const { rows } = await pool.query(
    `SELECT base_url, username_enc, password_enc FROM xtream_accounts WHERE user_id=$1`,
    [userId]
  );
  if (!rows.length) return null;
  return {
    baseUrl: rows[0].base_url,
    username: dec(rows[0].username_enc),
    password: dec(rows[0].password_enc),
  };
}
async function saveCreds(userId, baseUrl, username, password) {
  await ensureTable();
  await pool.query(
    `INSERT INTO xtream_accounts (user_id, base_url, username_enc, password_enc)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE
       SET base_url=EXCLUDED.base_url,
           username_enc=EXCLUDED.username_enc,
           password_enc=EXCLUDED.password_enc,
           updated_at=now()`,
    [userId, baseUrl, enc(username), enc(password)]
  );
}
async function deleteCreds(userId) {
  await ensureTable();
  await pool.query(`DELETE FROM xtream_accounts WHERE user_id=$1`, [userId]);
}
async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    return r;
  } finally {
    clearTimeout(t);
  }
}
function buildPlayerApi(baseUrl, username, password) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  return u.toString();
}

/* ============ Routes ============ */

/** POST /xtream/link  { baseUrl, username, password }
 *  Enregistre (chiffré) et teste l’accès.
 */
router.post("/link", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    const baseUrl = normalizeBaseUrl(req.body?.baseUrl);
    const username = (req.body?.username || "").toString().trim();
    const password = (req.body?.password || "").toString().trim();

    const missing = [];
    if (!baseUrl) missing.push("baseUrl");
    if (!username) missing.push("username");
    if (!password) missing.push("password");
    if (missing.length) return res.status(422).json({ message: "Missing fields", missing });

    // Test avant sauvegarde
    const testUrl = buildPlayerApi(baseUrl, username, password);
    const r = await fetchWithTimeout(testUrl, 8000);
    const text = await r.text();
    let ok = false, reason = "";
    if (r.ok) {
      try {
        const j = JSON.parse(text);
        ok = j?.user_info?.auth === 1 || j?.user_info?.status === "Active";
        reason = ok ? "OK" : "Invalid credentials";
      } catch {
        ok = false; reason = "Invalid response";
      }
    } else {
      reason = `HTTP_${r.status}`;
    }
    if (!ok) return res.status(400).json({ message: "Xtream test failed", reason });

    await saveCreds(req.user.sub, baseUrl, username, password);
    return res.json({ ok: true, baseUrl, username: mask(username) });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

/** GET /xtream/status  -> { linked, baseUrl, username } */
router.get("/status", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    const c = await getCreds(req.user.sub);
    if (!c) return res.json({ linked: false });
    return res.json({ linked: true, baseUrl: c.baseUrl, username: mask(c.username) });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

/** POST /xtream/test  (optionnel: baseUrl, username, password) */
router.post("/test", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    let { baseUrl, username, password } = req.body || {};
    if (!baseUrl || !username || !password) {
      const saved = await getCreds(req.user.sub);
      if (!saved) return res.status(400).json({ message: "No credentials provided or saved" });
      ({ baseUrl, username, password } = saved);
    }
    baseUrl = normalizeBaseUrl(baseUrl);

    const r = await fetchWithTimeout(buildPlayerApi(baseUrl, username, password), 8000);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ ok: false, reason: `HTTP_${r.status}` });
    try {
      const j = JSON.parse(text);
      const ok = j?.user_info?.auth === 1 || j?.user_info?.status === "Active";
      return res.json({ ok, raw: j });
    } catch {
      return res.status(502).json({ ok: false, reason: "Invalid JSON" });
    }
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

/** DELETE /xtream/unlink */
router.delete("/unlink", async (req, res, next) => {
  try {
    if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
    await deleteCreds(req.user.sub);
    res.status(204).end();
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

export default router;
