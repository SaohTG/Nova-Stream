// api/src/modules/tmdb.js
import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG ERROR]", e));

/* ===== helpers ===== */
async function fetchWithTimeout(url, ms = 12000, headers = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { signal: ctrl.signal, headers }); }
  finally { clearTimeout(t); }
}
async function fetchJson(url) {
  const r = await fetchWithTimeout(url, 12000, { "User-Agent": "LornaTV/1.0" });
  const txt = await r.text();
  if (!r.ok) { const err = new Error(`HTTP_${r.status}`); err.status = r.status; err.body = txt; throw err; }
  try { return JSON.parse(txt); } catch { const err = new Error("BAD_JSON"); err.body = txt; throw err; }
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
  if (m.startsWith("/")) return `${base}${m}`;
  return `${base}/${m}`;
}
function proxyXtreamImage(rawUrl) {
  if (!rawUrl) return "";
  return `/api/xtream/image?url=${encodeURIComponent(rawUrl)}`;
}
function mapIcon(it, baseUrl) {
  const raw = it.stream_icon || it.icon || it.logo || it.poster || it.image || it.cover || it.cover_big;
  const abs = absUrl(baseUrl, raw);
  const prox = proxyXtreamImage(abs);
  return {
    ...it,
    stream_icon: prox || it.stream_icon || "",
    icon: prox || it.icon || "",
    logo: prox || it.logo || "",
    poster: prox || it.poster || "",
    image: prox || it.image || "",
    cover: prox || it.cover || "",
    cover_big: prox || it.cover_big || "",
  };
}
async function ensureTables() {
  await pool.query(`CREATE TABLE IF NOT EXISTS xtream_accounts (
    user_id uuid PRIMARY KEY, base_url text NOT NULL,
    username_enc text NOT NULL, password_enc text NOT NULL,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );`);
  await pool.query(`CREATE TABLE IF NOT EXISTS user_xtream (
    user_id uuid PRIMARY KEY, base_url text NOT NULL,
    username_enc text NOT NULL, password_enc text NOT NULL,
    created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
  );`);
}
import crypto from "crypto";
function getKey() {
  const hex = (process.env.API_ENCRYPTION_KEY || "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("API_ENCRYPTION_KEY must be 64 hex chars");
  return Buffer.from(hex, "hex");
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
  return {
    baseUrl: normalizeBaseUrl(row.base_url),
    username: dec(row.username_enc),
    password: dec(row.password_enc),
  };
}
function buildPlayerApi(baseUrl, username, password, action, extra = {}) {
  const u = new URL(`${baseUrl}/player_api.php`);
  u.searchParams.set("username", username);
  u.searchParams.set("password", password);
  if (action) u.searchParams.set("action", action);
  for (const [k, v] of Object.entries(extra)) if (v != null) u.searchParams.set(k, String(v));
  return u.toString();
}
const norm = (s) => (s || "").toString()
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9\s]/g, " ")
  .replace(/\s+/g, " ")
  .trim();

/**
 * Calcule la date du prochain lundi à 00:00
 */
function getNextMonday() {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Dimanche, 1 = Lundi, ...
  const daysUntilMonday = dayOfWeek === 0 ? 1 : (8 - dayOfWeek);
  
  const nextMonday = new Date(now);
  nextMonday.setDate(now.getDate() + daysUntilMonday);
  nextMonday.setHours(0, 0, 0, 0);
  
  return nextMonday;
}

/**
 * Récupère le trending depuis le cache DB ou le génère
 */
async function getTrendingFromCacheOrGenerate(userId, creds) {
  const { pool } = await import("../db/index.js");
  const now = new Date();
  
  try {
    // Vérifier le cache
    const cacheResult = await pool.query(
      `SELECT data, expires_at FROM trending_cache 
       WHERE user_id = $1 AND expires_at > $2`,
      [userId, now]
    );
    
    if (cacheResult.rows.length > 0) {
      console.log(`[TRENDING CACHE] Hit pour user ${userId}`);
      return cacheResult.rows[0].data;
    }
    
    console.log(`[TRENDING CACHE] Miss pour user ${userId}, génération...`);
    
    // Générer le trending
    const key = process.env.TMDB_API_KEY;
    if (!key) return [];
    
    // charge catalogues Xtream une fois
    const [vodAll, serAll] = await Promise.all([
      fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_vod_streams")).catch(() => []),
      fetchJson(buildPlayerApi(creds.baseUrl, creds.username, creds.password, "get_series")).catch(() => []),
    ]);
    const xtream = [...(vodAll || []), ...(serAll || [])].map((it) => ({ ...it, _n: norm(it.name || it.title || it.stream_display_name) }));

    // étend le pool TMDB (pages 1..3)
    const tmdbPages = await Promise.all([1, 2, 3].map((p) =>
      fetchJson(`https://api.themoviedb.org/3/trending/all/week?api_key=${key}&page=${p}&language=fr-FR`).catch(() => ({ results: [] }))
    ));
    const tmdb = tmdbPages.flatMap(p => Array.isArray(p.results) ? p.results : []).filter(Boolean);

    const out = [];
    const used = new Set();
    for (const item of tmdb) {
      const t = norm(item.title || item.name);
      if (!t) continue;
      const hit = xtream.find((x) => x._n && (x._n.includes(t) || t.includes(x._n)));
      if (!hit) continue;
      const id = hit.stream_id || hit.series_id || hit.name;
      if (used.has(id)) continue;
      used.add(id);
      out.push(hit);
      if (out.length === 15) break;
    }

    const mapped = out.map((it, i) => ({ ...mapIcon(it, creds.baseUrl), __rank: i + 1 }));
    
    // Mettre en cache jusqu'au prochain lundi
    const nextMonday = getNextMonday();
    await pool.query(
      `INSERT INTO trending_cache (user_id, data, expires_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET data = $2, cached_at = now(), expires_at = $3`,
      [userId, JSON.stringify(mapped), nextMonday]
    );
    
    console.log(`[TRENDING CACHE] Généré et caché jusqu'au ${nextMonday.toISOString()}`);
    
    return mapped;
  } catch (error) {
    console.error("[TRENDING CACHE] Erreur:", error);
    throw error;
  }
}

/* ===== GET /tmdb/trending-week-mapped =====
   - Prend 3 pages TMDB (≈60 titres)
   - Matche avec VOD + Series Xtream par nom normalisé
   - Retourne les 15 premiers trouvés, avec images proxifiées Xtream et __rank 1..15
   - Cache en DB jusqu'au prochain lundi
*/
router.get("/trending-week-mapped", async (req, res, next) => {
  try {
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.json([]);
    
    const trending = await getTrendingFromCacheOrGenerate(req.user.sub, creds);
    res.json(trending);
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

/**
 * Force le rafraîchissement du cache trending pour l'utilisateur
 */
router.post("/refresh-trending", async (req, res, next) => {
  try {
    const { pool } = await import("../db/index.js");
    const creds = await getCreds(req.user?.sub);
    if (!creds) return res.json({ success: false, message: "Identifiants Xtream non configurés" });
    
    // Supprimer l'ancien cache
    await pool.query("DELETE FROM trending_cache WHERE user_id = $1", [req.user.sub]);
    console.log(`[TRENDING REFRESH] Cache supprimé pour user ${req.user.sub}`);
    
    // Régénérer
    const trending = await getTrendingFromCacheOrGenerate(req.user.sub, creds);
    
    res.json({ 
      success: true, 
      message: "Tendances rafraîchies avec succès",
      count: trending.length 
    });
  } catch (e) {
    e.status = e.status || 500;
    next(e);
  }
});

/**
 * Nettoie les caches expirés (appelé automatiquement au démarrage)
 */
export async function cleanExpiredTrendingCache() {
  try {
    const { pool } = await import("../db/index.js");
    const result = await pool.query(
      "DELETE FROM trending_cache WHERE expires_at < now() RETURNING user_id"
    );
    if (result.rowCount > 0) {
      console.log(`[TRENDING CLEANUP] ${result.rowCount} cache(s) expiré(s) supprimé(s)`);
    }
  } catch (error) {
    console.error("[TRENDING CLEANUP] Erreur:", error);
  }
}

export default router;
