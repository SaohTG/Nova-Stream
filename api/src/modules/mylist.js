import { Router } from "express";
import { Pool } from "pg";

const router = Router();
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on("error", (e) => console.error("[PG]", e));

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_mylist (
      user_id uuid NOT NULL,
      kind text NOT NULL CHECK (kind IN ('movie','series')),
      xtream_id text NOT NULL,
      title text,
      img text,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, kind, xtream_id)
    );
    CREATE INDEX IF NOT EXISTS user_mylist_user_updated_idx ON user_mylist(user_id, updated_at DESC);
  `);
}
const rowToDto = (r) => ({
  kind: r.kind,
  id: r.xtream_id,
  title: r.title || "",
  img: r.img || "",
  payload: r.payload || {},
  updatedAt: new Date(r.updated_at).getTime(),
});

router.use(async (_req, _res, next) => { await ensureTables(); next(); });

// GET /user/mylist
router.get("/", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const { rows } = await pool.query(
      "SELECT * FROM user_mylist WHERE user_id=$1 ORDER BY updated_at DESC",
      [uid]
    );
    res.json(rows.map(rowToDto));
  } catch (e) { next(e); }
});

// PUT /user/mylist/:kind/:id  body: {title?, img?, payload?}
router.put("/:kind/:id", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const kind = req.params.kind === "series" ? "series" : "movie";
    const xid = String(req.params.id);
    const { title = null, img = null, payload = {} } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO user_mylist (user_id,kind,xtream_id,title,img,payload,updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (user_id,kind,xtream_id) DO UPDATE
         SET title=COALESCE(EXCLUDED.title, user_mylist.title),
             img=COALESCE(EXCLUDED.img, user_mylist.img),
             payload=COALESCE(EXCLUDED.payload, user_mylist.payload),
             updated_at=now()
       RETURNING *`,
      [uid, kind, xid, title, img, payload]
    );
    res.json(rowToDto(rows[0]));
  } catch (e) { next(e); }
});

// DELETE /user/mylist/:kind/:id
router.delete("/:kind/:id", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const kind = req.params.kind === "series" ? "series" : "movie";
    const xid = String(req.params.id);
    await pool.query(
      "DELETE FROM user_mylist WHERE user_id=$1 AND kind=$2 AND xtream_id=$3",
      [uid, kind, xid]
    );
    res.status(204).end();
  } catch (e) { next(e); }
});

// POST /user/mylist/merge  body: {items:[{kind,id,title?,img?,payload?,updatedAt?}]}
router.post("/merge", async (req, res, next) => {
  try {
    const uid = req.user?.sub;
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const it of items) {
        const kind = it.kind === "series" ? "series" : "movie";
        const xid = String(it.id);
        await client.query(
          `INSERT INTO user_mylist (user_id,kind,xtream_id,title,img,payload,updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,to_timestamp($7/1000.0))
           ON CONFLICT (user_id,kind,xtream_id) DO UPDATE
             SET title=COALESCE(EXCLUDED.title, user_mylist.title),
                 img=COALESCE(EXCLUDED.img, user_mylist.img),
                 payload=COALESCE(EXCLUDED.payload, user_mylist.payload),
                 updated_at=GREATEST(user_mylist.updated_at, EXCLUDED.updated_at)`,
          [uid, kind, xid, it.title ?? null, it.img ?? null, it.payload ?? {}, it.updatedAt ?? Date.now()]
        );
      }
      await client.query("COMMIT");
    } catch (e) { await client.query("ROLLBACK"); throw e; }
    finally { client.release(); }

    const { rows } = await pool.query(
      "SELECT * FROM user_mylist WHERE user_id=$1 ORDER BY updated_at DESC",
      [uid]
    );
    res.json(rows.map(rowToDto));
  } catch (e) { next(e); }
});

export default router;
