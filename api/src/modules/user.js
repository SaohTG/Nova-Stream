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

/* ====== Utils ====== */
function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
// parcours profond: récupère toutes les chaînes présentes dans l'objet
function collectStringsDeep(obj, acc = []) {
  if (obj == null) return acc;
  if (typeof obj === "string") { acc.push(obj); return acc; }
  if (typeof obj !== "object") return acc;
  for (const v of Object.values(obj)) collectStringsDeep(v, acc);
  return acc;
}
// essaie d'extraire baseUrl/username/password à partir d'un lien Xtream complet
function parseXtreamFromString(s) {
  if (typeof s !== "string") return null;
  const str = s.trim();
  if (!/^https?:\/\//i.test(str)) return null;
  try {
    const u = new URL(str);
    const user = u.searchParams.get("username");
    const pass = u.searchParams.get("password");
    if (!user || !pass) return null;
    // player_api.php ou get.php -> on retire le fichier final pour retrouver la racine
    let base = `${u.protocol}//${u.host}`;
    if (/\/(player_api|get)\.php$/i.test(u.pathname)) {
      // rien à faire, on garde juste origin
    } else {
      // si c'est un autre chemin, on garde l'origin (propre et sûr)
    }
    return {
      baseUrl: normalizeBaseUrl(base),
      username: String(user).trim(),
      password: String(pass).trim(),
    };
  } catch {
    return null;
  }
}

// extraction souple (aliases + parsing de liens)
function extractFields(body = {}) {
  // alias "plats"
  let baseUrl = body.baseUrl || body.url || body.serverUrl || body.apiUrl || body.portal || body.endpoint;
  if (!baseUrl && body.host && body.port) baseUrl = `${body.host}:${body.port}`;
  let username = body.username || body.user || body.login || body.email || body.u;
  let password = body.password || body.pass || body.pwd || body.p;

  baseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : "";

  // si un des champs manque, on essaie de parser des liens complets présents quelque part dans le payload
  if (!baseUrl || !username || !password) {
    const allStrings = collectStringsDeep(body);
    for (const s of allStrings) {
      const hit = parseXtreamFromString(s);
      if (hit) {
        if (!baseUrl) baseUrl = hit.baseUrl;
        if (!username) username = hit.username;
        if (!password) password = hit.password;
        if (baseUrl && username && password) break;
      }
    }
  }

  // normalisation finale
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
      // message clair + indices (ne log pas les secrets)
      return res.status(422).json({
        message: "Missing required fields",
        missing,
        received: { baseUrl: !!baseUrl, username: !!username, password: !!password },
        tips: [
          "Tu peux envoyer { baseUrl, username, password }",
          "OU bien un lien complet Xtream: http://host:port/get.php?username=U&password=P&type=m3u",
        ],
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

    return res.json({ ok: true, baseUrl });
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
