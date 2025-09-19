// api/src/modules/xtream.js
import express from "express";
import { pool } from "../db/index.js";
import { decrypt } from "../lib/crypto.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";

const router = express.Router();

/* ----------------------------- Helpers ----------------------------- */

async function ensureXtreamTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS xtream_links (
      user_id UUID PRIMARY KEY,
      host TEXT NOT NULL,
      port INTEGER,
      username_enc TEXT NOT NULL,
      password_enc TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_xtream_links_user ON xtream_links(user_id);
  `);
}

function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("Host requis");

  // si host inclut déjà un schéma, le respecter
  if (!/^https?:\/\//i.test(h)) {
    h = `http://${h}`;
  }
  let url;
  try {
    url = new URL(h);
  } catch {
    throw new Error("Host invalide");
  }

  // si port fourni (et non déjà dans l'URL), l'appliquer
  const p = port ? parseInt(String(port), 10) : null;
  if (p && Number.isFinite(p) && p > 0) {
    url.port = String(p);
  }

  // pas de trailing slash
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString().replace(/\/+$/, "");
}

async function httpGetJson(url) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 10000);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      const err = new Error(`HTTP ${r.status}`);
      err.status = r.status;
      err.body = text;
      throw err;
    }
    // certaines API Xtream renvoient du texte JSON
    const txt = await r.text();
    try {
      return JSON.parse(txt);
    } catch {
      // parfois renvoie "null" ou vide
      if (!txt || txt === "null") return null;
      throw new Error("Réponse JSON invalide depuis Xtream");
    }
  } finally {
    clearTimeout(t);
  }
}

function pickPoster(obj) {
  return (
    obj?.stream_icon ||
    obj?.cover ||
    obj?.movie_image ||
    obj?.backdrop_path ||
    obj?.series_cover ||
    null
  );
}

/**
 * Récupère les identifiants Xtream liés pour l'utilisateur courant
 * → { base, host, port, username, password }
 */
async function getUserXtreamCreds(req) {
  const userId = requireAuthUserId(req);
  await ensureXtreamTable();

  const { rows } = await pool.query(
    "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id=$1",
    [userId]
  );
  if (!rows.length) {
    const err = new Error("Xtream non lié");
    err.status = 404;
    throw err;
  }

  const row = rows[0];
  const key = process.env.API_ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    throw new Error("API_ENCRYPTION_KEY invalide (64 hex requis)");
  }

  const username = await decrypt(row.username_enc, key);
  const password = await decrypt(row.password_enc, key);
  const base = buildBaseUrl(row.host, row.port);

  return { base, host: row.host, port: row.port, username, password };
}

/* ------------------------------ Routes ----------------------------- */

/**
 * POST /xtream/test
 * Body: { host, port?, username, password }
 * → { ok:true, status, base } ou { ok:false, error }
 * Note: public (pas besoin d'être authentifié) pour l'onboarding.
 */
router.post("/xtream/test", async (req, res) => {
  try {
    const { host, port, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, error: "host/username/password requis" });
    }
    const base = buildBaseUrl(host, port);
    const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(
      password
    )}`;

    const data = await httpGetJson(url);
    const status =
      data?.user_info?.status ||
      data?.user_info?.auth ||
      data?.user_info?.is_trial ||
      data?.user_info ||
      null;

    // Plusieurs panels : "Active" | "true" | 1
    const ok =
      String(status).toLowerCase() === "active" ||
      String(status).toLowerCase() === "true" ||
      status === 1 ||
      data?.user_info?.auth === 1;

    if (!ok) {
      return res.status(400).json({ ok: false, error: "Identifiants Xtream invalides", base, status });
    }
    res.json({ ok: true, base, status });
  } catch (e) {
    res.status(e.status || 500).json({ ok: false, error: e.message || "Echec du test Xtream" });
  }
});

/**
 * POST /xtream/movies
 * Body (optionnel): { category_id?, search?, page?, limit? }
 * → ARRAY d'objets: { stream_id, name, poster, rating, added }
 */
router.post("/xtream/movies", async (req, res) => {
  try {
    const { base, username, password } = await getUserXtreamCreds(req);
    const { category_id, search, page = 1, limit = 60 } = req.body || {};

    const qsCat = category_id ? `&category_id=${encodeURIComponent(String(category_id))}` : "";
    const url = `${base}/player_api.php?username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}&action=get_vod_streams${qsCat}`;

    const listRaw = await httpGetJson(url);
    let list = Array.isArray(listRaw) ? listRaw : Object.values(listRaw || {});

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter((it) => String(it?.name || "").toLowerCase().includes(q));
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 60));
    const start = (p - 1) * l;
    const slice = list.slice(start, start + l);

    const items = slice.map((it) => ({
      stream_id: it?.stream_id,
      name: it?.name,
      poster: pickPoster(it),
      rating: it?.rating ?? it?.rating_5based ?? null,
      added: it?.added || it?.releaseDate || it?.last_modified || null,
    }));

    res.set("X-Total-Count", String(list.length));
    return res.json(items);
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || "Failed to fetch movies" });
  }
});

/**
 * POST /xtream/series
 * Body (optionnel): { category_id?, search?, page?, limit? }
 * → ARRAY d'objets: { series_id, name, poster, category_id, rating, added }
 */
router.post("/xtream/series", async (req, res) => {
  try {
    const { base, username, password } = await getUserXtreamCreds(req);
    const { category_id, search, page = 1, limit = 60 } = req.body || {};

    const qsCat = category_id ? `&category_id=${encodeURIComponent(String(category_id))}` : "";
    const url = `${base}/player_api.php?username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}&action=get_series${qsCat}`;

    const listRaw = await httpGetJson(url);
    let list = Array.isArray(listRaw) ? listRaw : Object.values(listRaw || {});

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter((it) => String(it?.name || "").toLowerCase().includes(q));
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 60));
    const start = (p - 1) * l;
    const slice = list.slice(start, start + l);

    const items = slice.map((it) => ({
      series_id: it?.series_id,
      name: it?.name,
      category_id: it?.category_id ?? it?.category_ids ?? null,
      poster: pickPoster(it),
      rating: it?.rating ?? it?.rating_5based ?? null,
      added: it?.last_modified || it?.releaseDate || null,
    }));

    res.set("X-Total-Count", String(list.length));
    return res.json(items);
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || "Failed to fetch series" });
  }
});

/**
 * POST /xtream/live
 * Body (optionnel): { category_id?, search?, page?, limit? }
 * → ARRAY d'objets: { stream_id, name, logo, category_id, play_url }
 */
router.post("/xtream/live", async (req, res) => {
  try {
    const { base, username, password } = await getUserXtreamCreds(req);
    const { category_id, search, page = 1, limit = 60 } = req.body || {};

    const qsCat = category_id ? `&category_id=${encodeURIComponent(String(category_id))}` : "";
    const url = `${base}/player_api.php?username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}&action=get_live_streams${qsCat}`;

    const listRaw = await httpGetJson(url);
    let list = Array.isArray(listRaw) ? listRaw : Object.values(listRaw || {});

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter((it) => String(it?.name || "").toLowerCase().includes(q));
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 60));
    const start = (p - 1) * l;
    const slice = list.slice(start, start + l);

    const items = slice.map((it) => {
      const ext = it?.container_extension || "m3u8"; // souvent .m3u8 dispo
      const play_url = `${base}/live/${encodeURIComponent(username)}/${encodeURIComponent(
        password
      )}/${it?.stream_id}.${ext}`;
      return {
        stream_id: it?.stream_id,
        name: it?.name,
        category_id: it?.category_id ?? null,
        logo: pickPoster(it),
        play_url,
      };
    });

    res.set("X-Total-Count", String(list.length));
    return res.json(items);
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || "Failed to fetch live streams" });
  }
});

export default router;
