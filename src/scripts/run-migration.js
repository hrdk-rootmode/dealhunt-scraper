const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        console.log('🔄 Running database migration...\n');

        // Read SQL file
        const sqlPath = path.join(__dirname, 'migrate-db.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Execute migration
        await pool.query(sql);

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📊 Checking tables...\n');

        // Verify tables exist
        const tables = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log('📋 Tables in database:');
        tables.rows.forEach(row => {
            console.log(`   ✓ ${row.table_name}`);
        });

        // Check product_links columns
        console.log('\n🔍 Verifying product_links columns:');
        const columns = await pool.query(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_name = 'product_links'
            ORDER BY ordinal_position
        `);

        columns.rows.forEach(col => {
            console.log(`   ✓ ${col.column_name} (${col.data_type})`);
        });

        console.log('\n🎉 Database is ready!');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runMigration();