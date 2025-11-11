// api/src/db/init.js
import { pool } from "./index.js";

// Global flag to track UUID generation capability
let databaseUuidSupport = false;

/**
 * Check if database supports gen_random_uuid() function
 */
async function checkUuidSupport() {
  try {
    // First try to enable pgcrypto extension
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    
    // Test if gen_random_uuid() function works
    await pool.query("SELECT gen_random_uuid()");
    
    console.log("✓ Database UUID generation (gen_random_uuid) is available");
    return true;
  } catch (error) {
    console.log("ⓘ Database UUID generation not available, will use application-level generation");
    console.log("  Reason:", error.message);
    return false;
  }
}

/**
 * Get UUID generation capability
 */
export function getDatabaseUuidSupport() {
  return databaseUuidSupport;
}

/**
 * Initialize core database schema
 * This ensures all required tables exist with proper structure
 */
export async function initDatabase() {
  try {
    // Check UUID generation capability first
    databaseUuidSupport = await checkUuidSupport();
    
    // Create core tables from schema with conditional UUID defaults
    const uuidDefault = databaseUuidSupport ? "DEFAULT gen_random_uuid()" : "";
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY ${uuidDefault},
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY ${uuidDefault},
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        refresh_token TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        device TEXT
      );
      
      CREATE TABLE IF NOT EXISTS watchlist (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL,
        content_type TEXT NOT NULL,
        PRIMARY KEY (user_id, content_id, content_type)
      );
      
      CREATE TABLE IF NOT EXISTS progress (
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        content_id TEXT NOT NULL,
        position_seconds INTEGER DEFAULT 0,
        duration_seconds INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT now(),
        PRIMARY KEY (user_id, content_id)
      );
      
      CREATE TABLE IF NOT EXISTS trending_cache (
        id SERIAL PRIMARY KEY,
        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        data JSONB NOT NULL,
        cached_at TIMESTAMP DEFAULT now(),
        expires_at TIMESTAMP NOT NULL,
        UNIQUE (user_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_trending_expires ON trending_cache(expires_at);
      CREATE INDEX IF NOT EXISTS idx_trending_user ON trending_cache(user_id);
    `);
    
    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}
