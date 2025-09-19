// api/src/db/index.js (ESM)
import { Pool } from "pg";

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false }, // si nécessaire
});

pool.on("error", (err) => {
  console.error("Postgres pool error:", err);
});
