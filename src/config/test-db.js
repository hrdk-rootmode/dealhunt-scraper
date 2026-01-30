require('dotenv').config();
const { pool } = require('./database');
const fs = require('fs');
const path = require('path');

async function testDatabase() {
    console.log('🧪 Testing Database Connection...\n');

    try {
        // Test connection
        console.log('1️⃣ Testing connection...');
        const result = await pool.query('SELECT NOW()');
        console.log('✅ Connected! Server time:', result.rows[0].now);

        // Check if tables exist
        console.log('\n2️⃣ Checking if tables exist...');
        const tableCheck = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        if (tableCheck.rows.length === 0) {
            console.log('⚠️  No tables found. Creating schema...\n');
            
            // Read and execute schema.sql
            const schemaPath = path.join(__dirname, 'schema.sql');
            const schema = fs.readFileSync(schemaPath, 'utf8');
            
            await pool.query(schema);
            console.log('✅ Schema created successfully!\n');
        } else {
            console.log('✅ Tables found:');
            tableCheck.rows.forEach(row => {
                console.log(`   - ${row.table_name}`);
            });
        }

        // Check platforms
        console.log('\n3️⃣ Checking platforms...');
        const platforms = await pool.query('SELECT * FROM platforms');
        console.log(`✅ Found ${platforms.rows.length} platforms:`);
        platforms.rows.forEach(p => {
            console.log(`   - ${p.name}: ${p.base_url}`);
        });

        console.log('\n✅ Database test completed successfully!\n');
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Database test failed:', error.message);
        process.exit(1);
    }
}

testDatabase();