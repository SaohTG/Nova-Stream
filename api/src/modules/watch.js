// api/src/modules/watch.js
import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG]", e));

async function ensure() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_watch_progress (
      user_id uuid NOT NULL,
      key text NOT NULL,               -- ex: movie:123  episode:SERIES:1:3
      position_sec double precision NOT NULL DEFAULT 0,
      duration_sec double precision NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, key)
    );
    CREATE INDEX IF NOT EXISTS user_watch_progress_updated_idx ON user_watch_progress(user_id, updated_at DESC);
  `);
}
router.use(async (_req, _res, next) => { await ensure(); next(); });

// GET /user/watch/progress?keys=movie:1,episode:SER:1:2
router.get("/progress", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const keys = String(req.query.keys || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!keys.length) return res.json([]);
    const { rows } = await pool.query(
      `SELECT key, position_sec, duration_sec, EXTRACT(EPOCH FROM updated_at) * 1000 AS updated_at
       FROM user_watch_progress WHERE user_id=$1 AND key = ANY($2::text[])`,
      [uid, keys]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /user/watch/progress { key, position, duration }
router.post("/progress", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { key, position = 0, duration = 0 } = req.body || {};
    if (!key) return res.status(400).json({ error: "key required" });
    const { rows } = await pool.query(
      `INSERT INTO user_watch_progress (user_id, key, position_sec, duration_sec, updated_at)
       VALUES ($1,$2,$3,$4,now())
       ON CONFLICT (user_id,key) DO UPDATE
         SET position_sec=EXCLUDED.position_sec,
             duration_sec=EXCLUDED.duration_sec,
             updated_at=now()
       RETURNING key, position_sec, duration_sec, EXTRACT(EPOCH FROM updated_at)*1000 AS updated_at`,
      [uid, String(key), Number(position)||0, Number(duration)||0]
    );
    res.json(rows[0]);
  } catch (e) { next(e); }
});

export default router;
