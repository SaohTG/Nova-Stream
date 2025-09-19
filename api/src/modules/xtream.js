// api/src/modules/xtream.js (ESM) — renvoie un tableau en top-level
import express from "express";
import { pool } from "../db/index.js";
import { requireAuthUserId } from "../middleware/resolveMe.js";
import { decrypt } from "../lib/crypto.js";

const router = express.Router();

function buildBaseUrl(host, port) {
  let h = String(host || "").trim();
  if (!h) throw new Error("Missing host");
  if (/^https?:\/\//i.test(h)) {
    const u = new URL(h);
    if (port && !u.port) u.port = String(port);
    return u.toString().replace(/\/+$/, "");
  }
  const p = port ? parseInt(String(port), 10) : null;
  if (port && (!Number.isFinite(p) || p <= 0)) throw new Error("Invalid port");
  const scheme = p === 443 ? "https" : "http";
  return `${scheme}://${h}${p ? `:${p}` : ""}`;
}

async function getUserXtreamCreds(req) {
  const userId = requireAuthUserId(req);
  const { rows } = await pool.query(
    "SELECT host, port, username_enc, password_enc FROM xtream_links WHERE user_id=$1",
    [userId]
  );
  if (!rows.length) {
    const e = new Error("No Xtream link found for user");
    e.status = 404;
    throw e;
  }
  const row = rows[0];
  const key = process.env.API_ENCRYPTION_KEY;
  if (!key || key.length !== 64 || !/^[0-9a-fA-F]+$/.test(key)) {
    const e = new Error("Invalid API_ENCRYPTION_KEY (must be 64 hex chars)");
    e.status = 500;
    throw e;
  }
  const username = await decrypt(row.username_enc, key);
  const password = await decrypt(row.password_enc, key);
  const base = buildBaseUrl(row.host, row.port);
  return { base, username, password };
}

async function httpGetJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: controller.signal });
    if (!r.ok) {
      const e = new Error(`Upstream ${r.status}`);
      e.status = 502;
      throw e;
    }
    return await r.json();
  } catch (e) {
    if (String(e?.message).includes("AbortError")) {
      const er = new Error("Timeout contacting Xtream");
      er.status = 504;
      throw er;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * POST /xtream/test
 */
router.post("/xtream/test", async (req, res) => {
  try {
    const { host, port, username, password } = req.body || {};
    if (!host || !username || !password) {
      return res.status(400).json({ ok: false, error: "Missing host/username/password" });
    }
    const base = buildBaseUrl(host, port);
    const url = `${base}/player_api.php?username=${encodeURIComponent(
      String(username)
    )}&password=${encodeURIComponent(String(password))}`;
    const data = await httpGetJson(url, 8000);

    const ui = data?.user_info || {};
    const authOk =
      ui?.auth === 1 ||
      String(ui?.auth).toLowerCase() === "true" ||
      String(ui?.status || "").toLowerCase() === "active";

    if (!authOk) {
      return res.status(400).json({
        ok: false,
        error: "Invalid credentials or inactive account",
        user_info: ui,
        server_info: data?.server_info || null,
      });
    }
    return res.json({ ok: true, user_info: ui, server_info: data?.server_info || null, base_url: base });
  } catch (e) {
    return res.status(e.status || 400).json({ ok: false, error: e.message || "Test failed" });
  }
});

/**
 * POST /xtream/movies
 * Body (optionnel): { category_id?, search?, page?, limit? }
 * → Retourne **un tableau** de films (top-level) pour matcher le front (.slice()).
 *   Le total est envoyé dans le header `X-Total-Count`.
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

    // Certains Xtream renvoient un objet {id: item, ...} au lieu d'un array
    let list = Array.isArray(listRaw) ? listRaw : Object.values(listRaw || {});

    // Filtre texte
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      list = list.filter((it) => String(it?.name || "").toLowerCase().includes(q));
    }

    // Pagination (mais on renvoie quand même un array top-level)
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.max(1, Math.min(200, parseInt(limit, 10) || 60));
    const start = (p - 1) * l;
    const slice = list.slice(start, start + l);

    // Mapping: garder images Xtream + URL de lecture
    const items = slice.map((it) => {
      const poster = it?.stream_icon || it?.movie_image || null;
      const ext = it?.container_extension || "mp4";
      const play_url = `${base}/movie/${encodeURIComponent(username)}/${encodeURIComponent(
        password
      )}/${it?.stream_id}.${ext}`;
      return {
        stream_id: it?.stream_id,
        name: it?.name,
        category_id: it?.category_id,
        poster,
        rating: it?.rating ?? it?.rating_5based ?? null,
        added: it?.added || null,
        container_extension: ext,
        play_url,
      };
    });

    res.set("X-Total-Count", String(list.length));
    return res.json(items); // 👈 top-level array
  } catch (e) {
    return res.status(e.status || 500).json({ ok: false, error: e.message || "Failed to fetch movies" });
  }
});

export default router;
