// reset.js - Complete Database Reset
require('dotenv').config();
const { Client } = require('pg');
const { createClient } = require('redis');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

async function resetSystem() {
    console.log(`\n${CYAN}╔════════════════════════════════════════╗${RESET}`);
    console.log(`${CYAN}║   🚀 DEALHUNT V3.0 SYSTEM RESET        ║${RESET}`);
    console.log(`${CYAN}╚════════════════════════════════════════╝${RESET}\n`);

    // ========== STEP 1: REDIS ==========
    console.log(`${CYAN}[1/4] Cleaning Redis Cache...${RESET}`);
    
    if (process.env.REDIS_URL) {
        const redis = createClient({ url: process.env.REDIS_URL });
        redis.on('error', err => console.error('Redis Error:', err.message));
        
        try {
            await redis.connect();
            await redis.flushAll();
            console.log(`${GREEN}   ✅ Redis Flushed Successfully${RESET}`);
            await redis.disconnect();
        } catch (e) {
            console.log(`${YELLOW}   ⚠️ Redis Skipped: ${e.message}${RESET}`);
        }
    } else {
        console.log(`${YELLOW}   ⚠️ Redis URL not set, skipping...${RESET}`);
    }

    // ========== STEP 2: POSTGRES ==========
    console.log(`\n${CYAN}[2/4] Rebuilding Database Schema...${RESET}`);
    
    const db = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await db.connect();
        console.log(`${GREEN}   ✅ Connected to PostgreSQL${RESET}`);

        // Drop and recreate schema
        console.log(`${YELLOW}   ⏳ Dropping old schema...${RESET}`);
        await db.query('DROP SCHEMA public CASCADE;');
        await db.query('CREATE SCHEMA public;');
        await db.query('GRANT ALL ON SCHEMA public TO public;');
        console.log(`${GREEN}   ✅ Old Schema Dropped${RESET}`);

        // Read and execute V3 schema
        const schemaPath = path.join(__dirname, 'src', 'config', 'schema_v2.sql');
        
        if (!fs.existsSync(schemaPath)) {
            throw new Error(`Schema file not found at: ${schemaPath}`);
        }
        
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        console.log(`${YELLOW}   ⏳ Applying new schema...${RESET}`);
        await db.query('BEGIN');
        await db.query(schemaSql);
        await db.query('COMMIT');
        
        console.log(`${GREEN}   ✅ Schema V3 Applied Successfully${RESET}`);

    } catch (e) {
        try { await db.query('ROLLBACK'); } catch (re) {}
        console.error(`${RED}   ❌ Database Error: ${e.message}${RESET}`);
        process.exit(1);
    } finally {
        await db.end();
    }

    // ========== STEP 3: VERIFY ==========
    console.log(`\n${CYAN}[3/4] Verifying Database...${RESET}`);
    
    const verifyDb = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await verifyDb.connect();

        // Check tables
        const tables = await verifyDb.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log(`${GREEN}   📋 Tables Created:${RESET}`);
        tables.rows.forEach(row => {
            console.log(`      ✓ ${row.table_name}`);
        });

        // Check product_links columns
        const columns = await verifyDb.query(`
            SELECT column_name 
            FROM information_schema.columns
            WHERE table_name = 'product_links'
            ORDER BY ordinal_position
        `);

        console.log(`\n${GREEN}   🔍 product_links Columns:${RESET}`);
        columns.rows.forEach(col => {
            const highlight = col.column_name === 'is_verified' ? `${GREEN}★ ` : '  ';
            console.log(`      ${highlight}${col.column_name}${RESET}`);
        });

        // Check platforms
        const platforms = await verifyDb.query('SELECT name, is_active FROM platforms');
        console.log(`\n${GREEN}   🔌 Platforms Seeded:${RESET}`);
        platforms.rows.forEach(p => {
            const status = p.is_active ? '🟢' : '⚪';
            console.log(`      ${status} ${p.name}`);
        });

    } catch (e) {
        console.error(`${RED}   ❌ Verification Error: ${e.message}${RESET}`);
    } finally {
        await verifyDb.end();
    }

    // ========== STEP 4: COMPLETE ==========
    console.log(`\n${CYAN}[4/4] Syncing Platform Selectors...${RESET}`);
    console.log(`${YELLOW}   Run: npm run sync${RESET}`);

    console.log(`\n${GREEN}╔════════════════════════════════════════╗${RESET}`);
    console.log(`${GREEN}║   🎉 SYSTEM RESET COMPLETE!            ║${RESET}`);
    console.log(`${GREEN}╚════════════════════════════════════════╝${RESET}`);
    
    console.log(`\n${CYAN}Next Steps:${RESET}`);
    console.log(`   1. ${YELLOW}npm run sync${RESET}   (Load platform selectors)`);
    console.log(`   2. ${YELLOW}npm run dev${RESET}    (Start server)`);
    console.log(`   3. ${YELLOW}npm run seed${RESET}   (Collect products)\n`);
}

resetSystem().catch(e => {
    console.error(`${RED}Fatal Error: ${e.message}${RESET}`);
    process.exit(1);
});