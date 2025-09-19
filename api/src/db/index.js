// api/src/db/index.js
import { Pool } from "pg";

/**
 * Utilise la variable d'env DATABASE_URL, ex:
 * postgres://USER:PASS@db:5432/novastream
 */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // si besoin d'activer SSL en prod derrière un provider, décommente:
  // ssl: { rejectUnauthorized: false }
});

// Log des erreurs de pool (utile en prod)
pool.on("error", (err) => {
  console.error("Postgres pool error:", err);
});
