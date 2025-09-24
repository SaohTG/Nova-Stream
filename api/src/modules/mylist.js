// api/src/modules/mylist.js
import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG]", e));

async function ensure() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_mylist (
      user_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN ('movie','series')),
      xtream_id text NOT NULL,
      title text DEFAULT '',
      img text DEFAULT '',
      payload jsonb DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, xtream_id)
    );
    CREATE INDEX IF NOT EXISTS user_mylist_user_updated_idx
      ON user_mylist(user_id, updated_at DESC);
    CREATE INDEX IF NOT EXISTS user_mylist_user_item_idx
      ON user_mylist(user_id, xtream_id);
  `);
}
router.use(async (_req, _res, next) => { await ensure(); next(); });

// helper ETag
async function mylistTag(uid) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n, EXTRACT(EPOCH FROM COALESCE(MAX(updated_at),'epoch'))::bigint AS ts
     FROM user_mylist WHERE user_id=$1`, [uid]
  );
  const n = rows[0]?.n ?? 0;
  const ts = rows[0]?.ts ?? 0;
  return `W/"${n}-${ts}"`;
}

// GET /user/mylist  → ETag/304
router.get("/", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });

    const tag = await mylistTag(uid);
    res.setHeader("ETag", tag);
    const inm = req.headers["if-none-match"];
    if (inm && inm === tag) return res.status(304).end();

    const { rows } = await pool.query(
      `SELECT kind, xtream_id AS id, title, img, payload,
              EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"
       FROM user_mylist
       WHERE user_id=$1
       ORDER BY updated_at DESC`,
      [uid]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /user/mylist/merge
router.post("/merge", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const it of items) {
        const kind = it?.kind === "series" ? "series" : "movie";
        const id = String(it?.id ?? "");
        if (!id) continue;
        await client.query(
          `INSERT INTO user_mylist (user_id, kind, xtream_id, title, img, payload, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))
           ON CONFLICT (user_id,kind,xtream_id) DO UPDATE
             SET title=EXCLUDED.title,
                 img=EXCLUDED.img,
                 payload=EXCLUDED.payload,
                 updated_at=GREATEST(user_mylist.updated_at, EXCLUDED.updated_at)`,
          [uid, kind, id, it?.title||"", it?.img||"", it?.payload??{}, Number(it?.updatedAt)||Date.now()]
        );
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    const tag = await mylistTag(uid);
    res.setHeader("ETag", tag);

    const { rows } = await pool.query(
      `SELECT kind, xtream_id AS id, title, img, payload,
              EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"
       FROM user_mylist
       WHERE user_id=$1
       ORDER BY updated_at DESC`,
      [uid]
    );
    res.json(rows);
  } catch (e) { next(e); }
});

// POST /user/mylist/:kind/:id
router.post("/:kind/:id", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const kind = req.params.kind === "series" ? "series" : "movie";
    const id = String(req.params.id);
    const { title="", img="", payload=null } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO user_mylist (user_id, kind, xtream_id, title, img, payload, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6, now())
       ON CONFLICT (user_id,kind,xtream_id) DO UPDATE
         SET title=EXCLUDED.title,
             img=EXCLUDED.img,
             payload=EXCLUDED.payload,
             updated_at=now()
       RETURNING kind, xtream_id AS id, title, img, payload,
                 EXTRACT(EPOCH FROM updated_at)*1000 AS "updatedAt"`,
      [uid, kind, id, title, img, payload]
    );
    res.setHeader("ETag", await mylistTag(uid));
    res.status(201).json(rows[0]);
  } catch (e) { next(e); }
});

// DELETE /user/mylist/:kind/:id  → supprime par user_id + xtream_id
router.delete("/:kind/:id", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const id = String(req.params.id);
    await pool.query(
      `DELETE FROM user_mylist WHERE user_id=$1 AND xtream_id=$2`,
      [uid, id]
    );
    res.setHeader("ETag", await mylistTag(uid));
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
