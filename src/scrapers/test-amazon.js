require('dotenv').config();
const AmazonScraper = require('./amazon-scraper');
const { connectRedis } = require('../config/redis');
const { pool } = require('../config/database');

async function test() {
    console.log('🧪 Testing Amazon Scraper...\n');

    try {
        // Test database connection
        console.log('1️⃣ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Test Redis connection
        console.log('2️⃣ Testing Redis connection...');
        await connectRedis();
        console.log('✅ Redis connected\n');

        // Run scraper
        console.log('3️⃣ Starting scraper (20 products for testing)...\n');
        console.log('═══════════════════════════════════════════════════\n');
        
        const scraper = new AmazonScraper();
        await scraper.scrape({ maxProducts: 20 });

        console.log('\n✅ Test completed successfully!');
        
        // Close connections
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

test();