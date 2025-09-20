#!/usr/bin/env node

// Test script to understand the UUID generation issue
import { Pool } from "pg";
import { randomUUID } from "crypto";

// Simulate the environment from the app
const testDbUrl = process.env.DATABASE_URL || "postgresql://nova:changeme@localhost:5432/novastream";

async function testUUIDGeneration() {
  const pool = new Pool({ connectionString: testDbUrl });
  
  try {
    console.log("=== Testing UUID Generation Issue ===\n");
    
    // Test 1: Check if we can connect to database
    console.log("1. Testing database connection...");
    try {
      await pool.query("SELECT 1");
      console.log("✓ Database connection successful\n");
    } catch (err) {
      console.log("✗ Database connection failed:", err.message);
      console.log("   This is expected if PostgreSQL is not running\n");
      return;
    }
    
    // Test 2: Check pgcrypto extension
    console.log("2. Checking pgcrypto extension...");
    try {
      const { rows } = await pool.query("SELECT * FROM pg_extension WHERE extname = 'pgcrypto'");
      if (rows.length > 0) {
        console.log("✓ pgcrypto extension is installed");
      } else {
        console.log("✗ pgcrypto extension is not installed");
      }
    } catch (err) {
      console.log("✗ Error checking pgcrypto:", err.message);
    }
    
    // Test 3: Try to create extension
    console.log("\n3. Attempting to create pgcrypto extension...");
    try {
      await pool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);
      console.log("✓ pgcrypto extension created/verified");
    } catch (err) {
      console.log("✗ Failed to create pgcrypto extension:", err.message);
      console.log("   Error code:", err.code);
    }
    
    // Test 4: Test gen_random_uuid() function
    console.log("\n4. Testing gen_random_uuid() function...");
    try {
      const { rows } = await pool.query("SELECT gen_random_uuid() as test_uuid");
      console.log("✓ gen_random_uuid() works:", rows[0].test_uuid);
    } catch (err) {
      console.log("✗ gen_random_uuid() failed:", err.message);
      console.log("   Error code:", err.code);
    }
    
    // Test 5: Create test table to simulate the users table
    console.log("\n5. Testing table creation with UUID default...");
    try {
      await pool.query(`
        DROP TABLE IF EXISTS test_users_uuid;
        CREATE TABLE test_users_uuid (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT UNIQUE NOT NULL
        );
      `);
      console.log("✓ Test table with UUID default created successfully");
    } catch (err) {
      console.log("✗ Failed to create test table:", err.message);
      console.log("   Error code:", err.code);
    }
    
    // Test 6: Try inserting without specifying ID (simulate the failing case)
    console.log("\n6. Testing INSERT without ID (simulating the issue)...");
    try {
      const { rows } = await pool.query(
        "INSERT INTO test_users_uuid (email) VALUES ($1) RETURNING id::text AS id",
        [`test-${Date.now()}@example.com`]
      );
      console.log("✓ INSERT without ID successful:", rows[0].id);
    } catch (err) {
      console.log("✗ INSERT without ID failed:", err.message);
      console.log("   Error code:", err.code);
      console.log("   Error column:", err.column);
      
      // Test the fallback approach
      console.log("\n   Testing fallback with application-generated UUID...");
      try {
        const appUuid = randomUUID();
        const { rows } = await pool.query(
          "INSERT INTO test_users_uuid (id, email) VALUES ($1, $2) RETURNING id::text AS id",
          [appUuid, `test-fallback-${Date.now()}@example.com`]
        );
        console.log("✓ Fallback INSERT successful:", rows[0].id);
      } catch (fallbackErr) {
        console.log("✗ Even fallback INSERT failed:", fallbackErr.message);
      }
    }
    
    // Cleanup
    try {
      await pool.query("DROP TABLE IF EXISTS test_users_uuid");
      console.log("\n✓ Cleanup completed");
    } catch (err) {
      console.log("\n✗ Cleanup failed:", err.message);
    }
    
  } finally {
    await pool.end();
  }
}

testUUIDGeneration().catch(console.error);