// api/src/modules/xtream.js
import { Router } from "express";
import { Pool } from "pg";
import crypto from "crypto";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ============== Cache mémoire simple ============== */
const MEMO = new Map();           // key -> { t, v }
const ERROR_CACHE = new Map();    // key -> { t, error }
const TTL_MS = 5 * 60 * 1000;     // 5 min
const ERROR_TTL_MS = 2 * 60 * 1000; // 2 min pour les erreurs
const MAX_KEYS = 50;
const mkey = (uid, base, kind) => `${uid}|${base}|${kind}`;
const mget = (k) => {
  const entry = MEMO.get(k);
  if (!entry) return null;
  if (Date.now() - entry.t > TTL_MS) { MEMO.delete(k); return null; }
  return entry.v;
};
const mset = (k, v) => {
  if (MEMO.size >= MAX_KEYS) MEMO.delete(MEMO.keys().next().value);
  MEMO.set(k, { t: Date.now(), v });
};
const errorGet = (k) => {
  const entry = ERROR_CACHE.get(k);
  if (!entry) return null;
  if (Date.now() - entry.t > ERROR_TTL_MS) { ERROR_CACHE.delete(k); return null; }
  return entry.error;
};
const errorSet = (k, error) => {
  if (ERROR_CACHE.size >= MAX_KEYS) ERROR_CACHE.delete(ERROR_CACHE.keys().next().value);
  ERROR_CACHE.set(k, { t: Date.now(), error });
};

/* ============== AES-256-GCM ============== */
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

/* ============== Utils ============== */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// User-Agents réalistes pour éviter la détection
const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0"
];

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Rate limiting simple
const REQUEST_DELAYS = new Map(); // baseUrl -> lastRequestTime
const MIN_REQUEST_INTERVAL = 1000; // 1 seconde minimum entre les requêtes

async function rateLimit(baseUrl) {
  const now = Date.now();
  const lastRequest = REQUEST_DELAYS.get(baseUrl) || 0;
  const timeSinceLastRequest = now - lastRequest;
  
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    console.log(`[XTREAM RATE LIMIT] Waiting ${delay}ms before next request to ${baseUrl}`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  REQUEST_DELAYS.set(baseUrl, Date.now());
}

function normalizeBaseUrl(u) {
  let s = (u || "").toString().trim();
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  while (s.endsWith("/")) s = s.slice(0, -1);
  return s;
}
function absUrl(base, maybe) {
  const m = (maybe || "").toString().trim();
  if (!m) return "";
  if (/^https?:\/\//i.test(m)) return m;
  if (m.startsWith("//")) {
    try { return new URL(base).protocol + m; } catch { return "http:" + m; }
  }
  if (m.startsWith("/")) return `${base}${m}`;
  return `${base}/${m}`;
}
function buildPlayerApi(baseUrl, username, password, action, extra = {}) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  if (action) u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
async function fetchWithTimeout(url, ms = 10000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers }); }
  finally { clearTimeout(t); }
}
async function fetchJson(url, retries = 2, baseUrl = null) {
  // Rate limiting si baseUrl fourni
  if (baseUrl) {
    await rateLimit(baseUrl);
  }
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Rotation des User-Agents pour éviter la détection
      const userAgent = getRandomUserAgent();
      const r = await fetchWithTimeout(url, 15000, { 
        "User-Agent": userAgent,
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1"
      });
      const txt = await r.text();
      if (!r.ok) { 
        const err = new Error(`XTREAM_HTTP_${r.status}`); 
        err.status = r.status; 
        err.body = txt; 
        throw err; 
      }
      try { return JSON.parse(txt); } catch { const err = new Error("XTREAM_BAD_JSON"); err.body = txt; throw err; }
    } catch (error) {
      if (attempt === retries) throw error;
      
      // Retry logic for specific errors avec délais plus longs
      if (error.status === 403 || error.status === 429 || error.name === "AbortError") {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000); // Exponential backoff, max 10s
        // Logger seulement en mode développement pour réduire le bruit
        if (process.env.NODE_ENV === 'development') {
          console.log(`[XTREAM] Retry ${attempt + 1}/${retries + 1} (${error.message}) - wait ${delay}ms`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
}
async function fetchJsonBudget(url, _budgetMs = 1200, baseUrl = null) {
  try { return await fetchJson(url, 1, baseUrl); } // Moins de retries pour le budget
  catch (e) { if (e.name === "AbortError") return []; throw e; }
}

/* ============== DB helpers ============== */
async function ensureTables() {
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
  // Table de cache pour améliorer les performances
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xtream_cache (
      user_id uuid NOT NULL,
      cache_key text NOT NULL,
      data jsonb NOT NULL,
      cached_at timestamptz DEFAULT now(),
      expires_at timestamptz NOT NULL,
      PRIMARY KEY (user_id, cache_key)
    );
    CREATE INDEX IF NOT EXISTS idx_xtream_cache_expires ON xtream_cache(expires_at);
  `);
}

// Cache pour les credentials valides
const CREDENTIALS_CACHE = new Map(); // baseUrl -> { valid: boolean, lastCheck: timestamp }
const CREDENTIALS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Helpers de cache DB
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 heures

async function getCachedData(userId, cacheKey) {
  await ensureTables();
  const { rows } = await pool.query(
    `SELECT data, expires_at FROM xtream_cache 
     WHERE user_id = $1 AND cache_key = $2 AND expires_at > now()
     LIMIT 1`,
    [userId, cacheKey]
  );
  if (rows.length > 0) {
    console.log(`[XTREAM CACHE] Hit for ${cacheKey}`);
    return rows[0].data;
  }
  console.log(`[XTREAM CACHE] Miss for ${cacheKey}`);
  return null;
}

async function setCachedData(userId, cacheKey, data) {
  await ensureTables();
  const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
  await pool.query(
    `INSERT INTO xtream_cache (user_id, cache_key, data, expires_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, cache_key) 
     DO UPDATE SET data = EXCLUDED.data, cached_at = now(), expires_at = EXCLUDED.expires_at`,
    [userId, cacheKey, JSON.stringify(data), expiresAt]
  );
  console.log(`[XTREAM CACHE] Stored ${cacheKey}, expires in 12h`);
}

async function clearUserCache(userId) {
  await ensureTables();
  const { rowCount } = await pool.query(
    `DELETE FROM xtream_cache WHERE user_id = $1`,
    [userId]
  );
  console.log(`[XTREAM CACHE] Cleared ${rowCount} entries for user ${userId}`);
  return rowCount;
}

async function validateCredentials(creds) {
  const cacheKey = creds.baseUrl;
  const cached = CREDENTIALS_CACHE.get(cacheKey);
  
  // Cache plus long pour éviter trop de vérifications
  if (cached && (Date.now() - cached.lastCheck) < CREDENTIALS_CACHE_TTL) {
    return cached.valid;
  }
  
  try {
    const test = await fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password), 3, creds.baseUrl);
    const valid = test?.user_info?.auth === 1 || test?.user_info?.status === "Active";
    if (valid) {
      console.log('[XTREAM CREDENTIALS] Validation successful for', creds.baseUrl);
      CREDENTIALS_CACHE.set(cacheKey, { valid: true, lastCheck: Date.now() });
    }
    return valid;
  } catch (error) {
    // Ne logger qu'en mode dev pour réduire le bruit
    if (process.env.NODE_ENV === 'development') {
      console.log(`[XTREAM CREDENTIALS] Validation error for ${creds.baseUrl}:`, error.message, 'Status:', error.status);
    }
    
    // Stratégie tolérante : on considère les credentials comme valides sauf pour 401
    // Cela évite de bloquer les utilisateurs pour des problèmes temporaires
    
    // 401 = Vraiment invalides (mauvais login/password)
    if (error.status === 401) {
      console.error('[XTREAM CREDENTIALS] Authentication failed (401) - credentials are invalid');
      CREDENTIALS_CACHE.set(cacheKey, { valid: false, lastCheck: Date.now() });
      return false;
    }
    
    // Toutes les autres erreurs (403, 429, timeout, réseau, etc.) = on assume valides
    // L'utilisateur pourra quand même accéder au site, et les erreurs seront gérées au niveau des endpoints
    console.log('[XTREAM CREDENTIALS] Assuming credentials are valid despite error (not a 401)');
    CREDENTIALS_CACHE.set(cacheKey, { valid: true, lastCheck: Date.now() });
    return true;
  }
}
async function getCreds(userId) {
  await ensureTables();
  let row = (await pool.query(
    `SELECT base_url, username_enc, password_enc FROM xtream_accounts WHERE user_id=$1 LIMIT 1`, [userId]
  )).rows[0];
  if (!row) {
    row = (await pool.query(
      `SELECT base_url, username_enc, password_enc FROM user_xtream WHERE user_id=$1 LIMIT 1`, [userId]
    )).rows[0];
  }
  if (!row) return null;
  
  try {
    const creds = {
      baseUrl: normalizeBaseUrl(row.base_url),
      username: dec(row.username_enc),
      password: dec(row.password_enc),
    };
    
    // Valider les credentials si nécessaire
    const isValid = await validateCredentials(creds);
    if (!isValid) {
      console.warn(`[XTREAM CREDENTIALS] Invalid credentials for user ${userId}, baseUrl: ${creds.baseUrl}`);
      // Ne retourne pas null immédiatement, permet de retourner les creds pour une nouvelle tentative
      return creds;
    }
    
    return creds;
  } catch (error) {
    console.error('[XTREAM CREDENTIALS] Decryption failed:', error.message);
    // Si le déchiffrement échoue, c'est probablement un problème de clé
    return null;
  }
}

/* ============== Images helpers ============== */
function proxyUrl(rawUrl) {
  if (!rawUrl) return "";
  return `/api/xtream/image?url=${encodeURIComponent(rawUrl)}`;
}
function resolveIcon(raw, creds) {
  if (!raw) return "";
  const absolute = absUrl(creds.baseUrl, raw);
  return proxyUrl(absolute);
}
function mapListWithIcons(list = [], creds) {
  return (list || []).map((it) => {
    const raw = it.stream_icon || it.icon || it.logo || it.poster || it.image || it.cover || it.cover_big;
    const resolved = resolveIcon(raw, creds);
    return {
      ...it,
      stream_icon: resolved || it.stream_icon || "",
      icon: resolved || it.icon || "",
      logo: resolved || it.logo || "",
      poster: resolved || it.poster || "",
      image: resolved || it.image || "",
      cover: resolved || it.cover || "",
      cover_big: resolved || it.cover_big || "",
    };
  });
}
const pickCatId = (req) =>
  (req.query.category_id ?? req.query.categoryId ?? req.body?.category_id ?? req.body?.categoryId ?? "0");
const pickLimit = (req, fallback = 50, max = 200) => {
  const n = Number(req.query.limit ?? req.body?.limit ?? fallback);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.round(n), max);
};

/* ============== Link / Status ============== */
router.post("/link", ah(async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });

  const baseUrl = normalizeBaseUrl(req.body?.baseUrl || req.body?.serverUrl);
  const username = (req.body?.username || "").toString().trim();
  const password = (req.body?.password || "").toString().trim();
  if (!baseUrl || !username || !password) return res.status(422).json({ message: "Missing fields" });

  try {
    const test = await fetchJson(buildPlayerApi(baseUrl, username, password), 2, baseUrl);
    const ok = test?.user_info?.auth === 1 || test?.user_info?.status === "Active";
    if (!ok) return res.status(400).json({ message: "Xtream test failed" });
  } catch (e) {
    return res.status(e.status === 401 ? 400 : 503).json({ message: e.message || "Xtream unreachable" });
  }

  await ensureTables();
  await pool.query(
    `INSERT INTO xtream_accounts (user_id, base_url, username_enc, password_enc)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (user_id) DO UPDATE
       SET base_url=EXCLUDED.base_url,
           username_enc=EXCLUDED.username_enc,
           password_enc=EXCLUDED.password_enc,
           updated_at=now()`,
    [req.user.sub, baseUrl, enc(username), enc(password)]
  );
  res.json({ ok: true });
}));

router.get("/status", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub);
  res.json({ linked: !!c, baseUrl: c?.baseUrl || null });
}));

router.delete("/unlink", ah(async (req, res) => {
  await ensureTables();
  await pool.query(`DELETE FROM xtream_accounts WHERE user_id=$1`, [req.user?.sub]);
  await pool.query(`DELETE FROM user_xtream WHERE user_id=$1`, [req.user?.sub]);
  // Supprimer aussi le cache
  await clearUserCache(req.user?.sub);
  res.status(204).end();
}));

// Endpoint pour forcer le refresh du cache (bouton dans Settings)
router.post("/refresh-cache", ah(async (req, res) => {
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ message: "Unauthorized" });
  
  const cleared = await clearUserCache(userId);
  
  res.json({ 
    ok: true, 
    message: "Cache vidé avec succès. Les données seront rechargées au prochain accès.", 
    clearedEntries: cleared 
  });
}));

/* ============== Catalogues ============== */
// Movies
const handleMovieCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); 
  if (!c) return res.status(404).json({ message: "No creds" });
  
  const cacheKey = 'movie-categories';
  
  // Vérifier le cache DB d'abord
  const cached = await getCachedData(req.user.sub, cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // Pas en cache, fetch depuis Xtream
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_categories"), 3, c.baseUrl);
    const result = data || [];
    
    // Mettre en cache pour 12h
    if (result.length > 0) {
      await setCachedData(req.user.sub, cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error("[XTREAM ERROR] Movie categories fetch failed:", error.message, "Status:", error.status);
    
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    // Pour les 403 et erreurs réseau, retourner un tableau vide
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on movie-categories, returning empty array");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/movie-categories", handleMovieCategories);

const handleMovies = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  
  const cacheKey = `movies-cat-${category_id}-limit-${limit}`;
  
  // Vérifier le cache DB
  const cached = await getCachedData(req.user.sub, cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // Fetch depuis Xtream
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams", { category_id }), 3, c.baseUrl);
    const result = mapListWithIcons((data || []).slice(0, limit), c);
    
    // Mettre en cache
    if (result.length > 0) {
      await setCachedData(req.user.sub, cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error("[XTREAM ERROR] Movies fetch failed:", error.message, "Status:", error.status);
    
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on movies, returning empty array");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/movies", handleMovies);
router.post("/movies", handleMovies);

router.get("/vod-info/:vod_id", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_info", { vod_id: req.params.vod_id }), 2, c.baseUrl);
  const coverRaw = info?.movie_data?.cover_big || info?.movie_data?.movie_image;
  const cover = resolveIcon(coverRaw, c);
  res.json({ ...info, movie_data: { ...info?.movie_data, cover_big: cover, movie_image: cover } });
}));

// Series
const handleSeriesCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); 
  if (!c) return res.status(404).json({ message: "No creds" });
  
  const cacheKey = 'series-categories';
  
  // Vérifier le cache DB
  const cached = await getCachedData(req.user.sub, cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // Fetch depuis Xtream
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_categories"), 3, c.baseUrl);
    const result = data || [];
    
    // Mettre en cache
    if (result.length > 0) {
      await setCachedData(req.user.sub, cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error("[XTREAM ERROR] Series categories fetch failed:", error.message, "Status:", error.status);
    
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on series-categories, returning empty array");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/series-categories", handleSeriesCategories);

const handleSeries = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); 
  if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series", { category_id }), 3, c.baseUrl);
    res.json(mapListWithIcons((data || []).slice(0, limit), c));
  } catch (error) {
    console.error("[XTREAM ERROR] Series fetch failed:", error.message, "Status:", error.status);
    
    // Seulement invalider pour 401
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    // Pour 403 et erreurs réseau, retourner un tableau vide
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on series, returning empty array to keep site usable");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/series", handleSeries);
router.post("/series", handleSeries);

router.get("/series-info/:series_id", ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });
  const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series_info", { series_id: req.params.series_id }), 2, c.baseUrl);
  const posterRaw = info?.info?.cover || info?.info?.backdrop_path;
  const poster = resolveIcon(posterRaw, c);
  res.json({ ...info, info: { ...info?.info, cover: poster, backdrop_path: poster } });
}));

// Live
const handleLiveCategories = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); 
  if (!c) return res.status(404).json({ message: "No creds" });
  
  const cacheKey = 'live-categories';
  
  // Vérifier le cache DB
  const cached = await getCachedData(req.user.sub, cacheKey);
  if (cached) {
    return res.json(cached);
  }
  
  // Fetch depuis Xtream
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_categories"), 3, c.baseUrl);
    const result = data || [];
    
    // Mettre en cache
    if (result.length > 0) {
      await setCachedData(req.user.sub, cacheKey, result);
    }
    
    res.json(result);
  } catch (error) {
    console.error("[XTREAM ERROR] Live categories fetch failed:", error.message, "Status:", error.status);
    
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on live-categories, returning empty array");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/live-categories", handleLiveCategories);

const handleLive = ah(async (req, res) => {
  const c = await getCreds(req.user?.sub); 
  if (!c) return res.status(404).json({ message: "No creds" });
  const category_id = pickCatId(req);
  const limit = pickLimit(req, 50);
  
  try {
    const data = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_streams", { category_id }), 3, c.baseUrl);
    res.json(mapListWithIcons((data || []).slice(0, limit), c));
  } catch (error) {
    console.error("[XTREAM ERROR] Live fetch failed:", error.message, "Status:", error.status);
    
    // Seulement invalider pour 401
    if (error.status === 401) {
      CREDENTIALS_CACHE.delete(c.baseUrl);
      return res.status(401).json({ message: "Xtream credentials expired, please re-link your account" });
    }
    
    // Pour 403 et erreurs réseau, retourner un tableau vide
    if (error.status === 403 || error.message?.includes('timeout') || error.message?.includes('ECONNREFUSED')) {
      console.warn("[XTREAM] Error on live, returning empty array to keep site usable");
      return res.json([]);
    }
    
    return res.status(503).json({ message: "Xtream service unavailable" });
  }
});
router.get("/live", handleLive);
router.post("/live", handleLive);

/* ============== Recherche multi-types (cache + budget) ============== */
router.get("/search", ah(async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ movies: [], series: [], live: [] });

  const c = await getCreds(req.user?.sub);
  if (!c) return res.status(404).json({ message: "No creds" });

  const kVod = mkey(req.user.sub, c.baseUrl, "vod");
  const kSer = mkey(req.user.sub, c.baseUrl, "series");
  const kLiv = mkey(req.user.sub, c.baseUrl, "live");

  let vod = mget(kVod);
  let ser = mget(kSer);
  let liv = mget(kLiv);

  const needsVod = !vod;
  const needsSer = !ser;
  const needsLiv = !liv;

  if (needsVod || needsSer || needsLiv) {
    try {
      const [vodRaw, serRaw, livRaw] = await Promise.all([
        needsVod ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams"), 1200, c.baseUrl) : null,
        needsSer ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_series"), 1200, c.baseUrl) : null,
        needsLiv ? fetchJsonBudget(buildPlayerApi(c.baseUrl, c.username, c.password, "get_live_streams"), 1200, c.baseUrl) : null,
      ]);

      if (needsVod) { vod = mapListWithIcons(vodRaw || [], c); mset(kVod, vod); }
      if (needsSer) { ser = mapListWithIcons(serRaw || [], c); mset(kSer, ser); }
      if (needsLiv) { liv = mapListWithIcons(livRaw || [], c); mset(kLiv, liv); }
    } catch (error) {
      console.error("[XTREAM ERROR] Search fetch failed:", error.message);
      
      // Invalider le cache des credentials en cas d'erreur 401/403
      if (error.status === 401 || error.status === 403) {
        CREDENTIALS_CACHE.delete(c.baseUrl);
      }
      
      if (error.status === 401) {
        return res.status(403).json({ message: "Xtream credentials expired or invalid" });
      }
      if (error.status === 403) {
        return res.status(403).json({ message: "Xtream access forbidden - check account permissions" });
      }
      return res.status(503).json({ message: "Xtream service unavailable" });
    }
  }

  const ql = q.toLowerCase();
  const nameOf = (it) => it.name || it.title || it.stream_display_name || "";
  const match = (it) => nameOf(it).toString().toLowerCase().includes(ql);

  const movies = (vod || []).filter(match).slice(0, 50);
  const series = (ser || []).filter(match).slice(0, 50);
  const live   = (liv || []).filter(match).slice(0, 50);

  res.json({ movies, series, live });
}));

/* ============== Image proxy ============== */
router.get("/image", ah(async (req, res) => {
  if (!req.user?.sub) return res.status(401).json({ message: "Unauthorized" });
  const c = await getCreds(req.user?.sub); if (!c) return res.status(404).json({ message: "No creds" });

  const url = req.query.url;
  if (!url || !/^https?:\/\//i.test(String(url))) return res.status(400).json({ message: "url required" });

  const r = await fetchWithTimeout(String(url), 12000, {
    "User-Agent": getRandomUserAgent(),
    "Referer": c.baseUrl,
    "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  }).catch(() => null);

  if (!r || !r.ok) return res.status(503).end();

  const ct = r.headers.get("content-type") || "image/jpeg";
  res.setHeader("Content-Type", ct);
  res.setHeader("Cache-Control", "public, max-age=86400");
  const buf = Buffer.from(await r.arrayBuffer());
  res.end(buf);
}));

/* ============== NEW: /xtream/stream-url (résolution URL de lecture) ============== */
/**
 * GET /xtream/stream-url?kind=movie|series|live&id=<tmdbId>&title=<opt>&year=<opt>
 * Réponse: { src }
 * - Pour movie/series: renvoie une URL *chemin Xtream* (ex: /movie/<user>/<pass>/<stream_id>.<ext>)
 *   qui sera mappée en proxy /api/stream/... par le VideoPlayer.jsx.
 * - Live non implémenté ici (retour 404).
 */
router.get("/stream-url", ah(async (req, res) => {
  const uid = req.user?.sub;
  if (!uid) return res.status(401).json({ error: "unauthorized" });

  const kind = String(req.query.kind || "").toLowerCase();
  const tmdbId = String(req.query.id || "").trim();
  const qTitle = String(req.query.title || "").trim();
  const qYear  = String(req.query.year  || "").trim();

  if (!kind || !tmdbId) return res.status(400).json({ error: "missing_params" });

  const c = await getCreds(uid);
  if (!c) return res.status(404).json({ error: "xtream_account_not_found" });

  if (kind === "live") {
    return res.status(404).json({ error: "live_resolution_not_implemented" });
  }

  // VOD/Series: lister les VOD puis matcher
  const list = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_streams"), 2, c.baseUrl).catch(() => []);
  if (!Array.isArray(list) || !list.length) return res.status(404).json({ error: "vod_list_empty" });

  const nrm = (s) => String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  let hit = list.find((x) => String(x.tmdb_id || "").trim() === tmdbId);
  if (!hit && (qTitle || qYear)) {
    const want = nrm(qTitle);
    let cands = want ? list.filter((x) => nrm(x.name || x.title) === want) : [];
    if (qYear) {
      const y = cands.filter((x) => String(x.year || "") === String(qYear));
      if (y.length) cands = y;
    }
    hit = cands[0];
  }
  if (!hit?.stream_id) return res.status(404).json({ error: "vod_not_found" });

  // Récupérer l’extension
  let ext = "mp4";
  try {
    const info = await fetchJson(buildPlayerApi(c.baseUrl, c.username, c.password, "get_vod_info", { vod_id: hit.stream_id }), 2, c.baseUrl);
    ext = (info?.info?.container_extension || info?.movie_data?.container_extension || "mp4").toLowerCase();
  } catch { /* fallback mp4 */ }

  // IMPORTANT: on renvoie un *chemin* Xtream, pas l’hôte → le lecteur le mappe vers /api/stream/...
  const src =
    `/${(kind === "series" ? "series" : "movie")}/${encodeURIComponent(c.username)}/${encodeURIComponent(c.password)}/${encodeURIComponent(hit.stream_id)}.${ext}`;

  res.json({ src });
}));

export default router;
