// api/src/modules/xtream.js
import express from "express";
import { pool } from "../db/index.js";
import { decrypt } from "../lib/crypto.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";

const router = express.Router();

// Cache en mémoire des catégories (clé: `${userId}:${type}`), TTL 10 min
const catCache = new Map();
const CAT_TTL_MS = 10 * 60 * 1000;

function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("host requis");
  if (!/^https?:\/\//i.test(h)) h = `http://${h}`;
  let url;
  try { url = new URL(h); } catch { throw new Error("host invalide"); }
  const p = port ? parseInt(String(port), 10) : null;
  if (p && Number.isFinite(p) && p > 0) url.port = String(p);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

async function httpGetJson(url, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: "application/json,*/*" } });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`HTTP ${r.status}`);
      err.status = r.status;
      err.body = text;
      throw err;
    }
    const txt = await r.text();
    try { return JSON.parse(txt); }
    catch {
      if (!txt || txt === "null") return null;
      const err = new Error("Réponse JSON invalide depuis Xtream");
      err.status = 502;
      err.body = txt.slice(0, 300);
      throw err;
    }
  } catch (e) {
    if (e?.name === "AbortError") {
      const err = new Error("Xtream a mis trop de temps à répondre");
      err.status = 504;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function getLinkedCredentials(userId) {
  const { rows } = await pool.query(
    "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id=$1",
    [userId]
  );
  if (!rows.length) {
    const err = new Error("Aucun compte Xtream lié");
    err.status = 404;
    throw err;
  }
  const key = process.env.API_ENCRYPTION_KEY;
  const username = await decrypt(rows[0].username_enc, key);
  const password = await decrypt(rows[0].password_enc, key);
  const base = buildBaseUrl(rows[0].host, rows[0].port);
  return { base, username, password };
}

function catActionFor(type) {
  if (type === "movie") return "get_vod_categories";
  if (type === "series") return "get_series_categories";
  if (type === "live") return "get_live_categories";
  throw new Error("type inconnu");
}

function listActionFor(type) {
  if (type === "movie") return "get_vod_streams";
  if (type === "series") return "get_series";
  if (type === "live") return "get_live_streams";
  throw new Error("type inconnu");
}

async function getCategoriesMap(userId, type, creds) {
  const key = `${userId}:${type}`;
  const now = Date.now();
  const hit = catCache.get(key);
  if (hit && now - hit.t < CAT_TTL_MS) return hit.map;

  const url = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${catActionFor(type)}`;
  const arr = await httpGetJson(url, Number(process.env.XTREAM_TIMEOUT_MS || 10000));
  const map = new Map();
  if (Array.isArray(arr)) {
    for (const c of arr) {
      const id = String(c.category_id ?? "");
      const name = c.category_name ?? "Autres";
      if (id) map.set(id, name);
    }
  }
  catCache.set(key, { t: now, map });
  return map;
}

function mapMovieItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  return {
    stream_id: it.stream_id,
    name: it.name,
    // image depuis Xtream uniquement
    cover: it.stream_icon || it.cover || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    container_extension: it.container_extension || null,
    rating: it.rating || null,
    added: it.added || null,
    plot: it.plot || it.description || null, // on ne met PAS TMDB ici, c’est côté détail si besoin
  };
}

function mapSeriesItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  return {
    series_id: it.series_id,
    name: it.name,
    cover: it.cover || it.stream_icon || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    rating: it.rating || null,
    plot: it.plot || it.overview || null,
    last_modified: it.last_modified || null,
  };
}

function mapLiveItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  return {
    stream_id: it.stream_id,
    name: it.name,
    cover: it.stream_icon || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    stream_type: it.stream_type || null,
    stream_url: it.stream_url || null,
  };
}

/* -------------------------------- Endpoints ------------------------------- */

// Catégories brutes (utile si front veut afficher un menu)
router.get("/xtream/movie-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "movie", creds);
    const out = Array.from(map.entries()).map(([category_id, category_name]) => ({ category_id, category_name }));
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

router.get("/xtream/series-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "series", creds);
    const out = Array.from(map.entries()).map(([category_id, category_name]) => ({ category_id, category_name }));
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

router.get("/xtream/live-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "live", creds);
    const out = Array.from(map.entries()).map(([category_id, category_name]) => ({ category_id, category_name }));
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

// Listes enrichies (avec category_name)

router.post("/xtream/movies", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit } = req.body || {};
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "movie", creds);

    const url = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${listActionFor("movie")}`;
    const arr = await httpGetJson(url, Number(process.env.XTREAM_TIMEOUT_MS || 10000));

    let items = Array.isArray(arr) ? arr.map((it) => mapMovieItem(it, catMap)) : [];
    if (limit && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    res.json(items);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

router.post("/xtream/series", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit } = req.body || {};
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "series", creds);

    const url = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${listActionFor("series")}`;
    const arr = await httpGetJson(url, Number(process.env.XTREAM_TIMEOUT_MS || 10000));

    let items = Array.isArray(arr) ? arr.map((it) => mapSeriesItem(it, catMap)) : [];
    if (limit && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    res.json(items);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

router.post("/xtream/live", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit } = req.body || {};
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "live", creds);

    const url = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}&action=${listActionFor("live")}`;
    const arr = await httpGetJson(url, Number(process.env.XTREAM_TIMEOUT_MS || 10000));

    let items = Array.isArray(arr) ? arr.map((it) => mapLiveItem(it, catMap)) : [];
    if (limit && Number.isFinite(Number(limit))) items = items.slice(0, Number(limit));
    res.json(items);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

export default router;
