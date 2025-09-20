// api/src/db/init.js
import { pool } from "./index.js";

/**
 * Initialize core database schema
 * This ensures all required tables exist with proper structure
 */
export async function initDatabase() {
  try {
    // Enable pgcrypto extension for gen_random_uuid()
    await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
    
    // Create core tables from schema
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT now()
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
    `);
    
    console.log("Database initialization completed successfully");
  } catch (error) {
    console.error("Database initialization failed:", error);
    throw error;
  }
}