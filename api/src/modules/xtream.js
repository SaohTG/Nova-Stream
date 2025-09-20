// api/src/modules/xtream.js
import express from "express";
import { pool } from "../db/index.js";
import { decrypt } from "../lib/crypto.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";

const router = express.Router();

// Cache catégories 10 min
const catCache = new Map();
const CAT_TTL_MS = 10 * 60 * 1000;

const TIMEOUT = Math.max(5000, Number(process.env.XTREAM_TIMEOUT_MS || 10000));

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

async function httpGetJson(url, timeoutMs = TIMEOUT) {
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
  } finally { clearTimeout(t); }
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
  const arr = await httpGetJson(url, TIMEOUT);
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

/* ---------------------------- Mapping normalisé --------------------------- */
function pickImage(...candidates) {
  for (const v of candidates) {
    if (v && typeof v === "string") return v;
  }
  return null;
}

function mapMovieItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  return {
    stream_id: it.stream_id,
    name: it.name,
    // image normalisée + champs bruts
    image: pickImage(it.stream_icon, it.cover),
    stream_icon: it.stream_icon || null,
    cover: it.cover || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    container_extension: it.container_extension || null,
    rating: it.rating || null,
    added: it.added || null,
    plot: it.plot || it.description || null,
  };
}
function mapSeriesItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  const img = pickImage(it.cover, it.stream_icon);
  return {
    series_id: it.series_id,
    name: it.name,
    image: img,
    cover: it.cover || null,
    stream_icon: it.stream_icon || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    rating: it.rating || null,
    plot: it.plot || it.overview || null,
    last_modified: it.last_modified || null,
  };
}
function mapLiveItem(it, catMap) {
  const cid = String(it.category_id ?? "");
  const img = pickImage(it.stream_icon);
  return {
    stream_id: it.stream_id,
    name: it.name,
    image: img,
    stream_icon: it.stream_icon || null,
    category_id: cid || "0",
    category_name: catMap.get(cid) || "Autres",
    stream_type: it.stream_type || null,
  };
}

/* ------------------------------ Utilitaires ------------------------------ */
function makeUrl(creds, qs) {
  const base = `${creds.base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  return `${base}&${qs}`;
}
async function listMovies(creds, category_id) {
  const extra = category_id ? `&category_id=${encodeURIComponent(category_id)}` : "";
  return httpGetJson(makeUrl(creds, `action=${listActionFor("movie")}${extra}`), TIMEOUT);
}
async function listSeries(creds, category_id) {
  const extra = category_id ? `&category_id=${encodeURIComponent(category_id)}` : "";
  return httpGetJson(makeUrl(creds, `action=${listActionFor("series")}${extra}`), TIMEOUT);
}
async function listLive(creds, category_id) {
  const extra = category_id ? `&category_id=${encodeURIComponent(category_id)}` : "";
  return httpGetJson(makeUrl(creds, `action=${listActionFor("live")}${extra}`), TIMEOUT);
}

/* -------------------------------- Endpoints ------------------------------- */

// Catégories
router.get("/xtream/movie-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "movie", creds);
    res.json(Array.from(map, ([category_id, category_name]) => ({ category_id, category_name })));
  } catch (e) { res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" }); }
});
router.get("/xtream/series-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "series", creds);
    res.json(Array.from(map, ([category_id, category_name]) => ({ category_id, category_name })));
  } catch (e) { res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" }); }
});
router.get("/xtream/live-categories", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const creds = await getLinkedCredentials(userId);
    const map = await getCategoriesMap(userId, "live", creds);
    res.json(Array.from(map, ([category_id, category_name]) => ({ category_id, category_name })));
  } catch (e) { res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" }); }
});

// Movies (support category_id & limit)
router.post("/xtream/movies", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit: rawLimit, category_id } = req.body || {};
    const limit = Math.max(1, Math.min(Number(rawLimit || 200), 2000));
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "movie", creds);

    let out = [];
    if (category_id) {
      const arr = await listMovies(creds, String(category_id));
      out = (Array.isArray(arr) ? arr : []).map((it) => mapMovieItem(it, catMap)).slice(0, limit);
    } else {
      // on itère catégorie par catégorie jusqu'à atteindre le limit
      for (const [cid] of catMap) {
        const arr = await listMovies(creds, cid);
        const mapped = (Array.isArray(arr) ? arr : []).map((it) => mapMovieItem(it, catMap));
        out.push(...mapped);
        if (out.length >= limit) { out = out.slice(0, limit); break; }
      }
    }
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

// Series
router.post("/xtream/series", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit: rawLimit, category_id } = req.body || {};
    const limit = Math.max(1, Math.min(Number(rawLimit || 200), 2000));
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "series", creds);

    let out = [];
    if (category_id) {
      const arr = await listSeries(creds, String(category_id));
      out = (Array.isArray(arr) ? arr : []).map((it) => mapSeriesItem(it, catMap)).slice(0, limit);
    } else {
      for (const [cid] of catMap) {
        const arr = await listSeries(creds, cid);
        const mapped = (Array.isArray(arr) ? arr : []).map((it) => mapSeriesItem(it, catMap));
        out.push(...mapped);
        if (out.length >= limit) { out = out.slice(0, limit); break; }
      }
    }
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

// Live
router.post("/xtream/live", async (req, res) => {
  try {
    const userId = requireAuthUserId(req, res);
    const { limit: rawLimit, category_id } = req.body || {};
    const limit = Math.max(1, Math.min(Number(rawLimit || 300), 3000));
    const creds = await getLinkedCredentials(userId);
    const catMap = await getCategoriesMap(userId, "live", creds);

    let out = [];
    if (category_id) {
      const arr = await listLive(creds, String(category_id));
      out = (Array.isArray(arr) ? arr : []).map((it) => mapLiveItem(it, catMap)).slice(0, limit);
    } else {
      for (const [cid] of catMap) {
        const arr = await listLive(creds, cid);
        const mapped = (Array.isArray(arr) ? arr : []).map((it) => mapLiveItem(it, catMap));
        out.push(...mapped);
        if (out.length >= limit) { out = out.slice(0, limit); break; }
      }
    }
    res.json(out);
  } catch (e) {
    res.status(e?.status || 500).json({ ok: false, error: e?.message || "Erreur" });
  }
});

export default router;
