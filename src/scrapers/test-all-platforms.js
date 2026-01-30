require('dotenv').config();
const platformLoader = require('./core/platform-loader');
const { connectRedis } = require('../config/redis'); // Fixed import
const { pool } = require('../config/database');

async function testAllPlatforms() {
    console.log('🧪 Testing All Platforms...\n');

    try {
        // Test database
        console.log('1️⃣ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Test Redis
        console.log('2️⃣ Testing Redis connection...');
        await connectRedis();
        console.log('✅ Redis connected\n');

        // Get enabled platforms
        // Since we don't have settings.js fully integrated yet, use platformLoader
        const platforms = platformLoader.getAllPlatforms();
        console.log(`📦 Found ${platforms.length} platforms: ${platforms.map(p => p.platformName).join(', ')}\n`);

        const results = {};

        for (const platform of platforms) {
            console.log('\n' + '═'.repeat(60));
            console.log(`🚀 Testing ${platform.platformName}`);
            console.log('═'.repeat(60));
            
            try {
                // Scrape 5 products from each platform for testing
                const result = await platform.scrape({ maxProducts: 5 });
                results[platform.platformName] = result;
                
            } catch (error) {
                console.error(`❌ ${platform.platformName} failed:`, error.message);
                results[platform.platformName] = { error: error.message };
            }
        }

        console.log('\n' + '═'.repeat(60));
        console.log('📊 FINAL RESULTS');
        console.log('═'.repeat(60));
        
        for (const [name, result] of Object.entries(results)) {
            if (result.error) {
                console.log(`❌ ${name}: FAILED - ${result.error}`);
            } else {
                console.log(`✅ ${name}: ${result.scraped} scraped (${result.new || 0} new, ${result.updated || 0} updated)`);
            }
        }

        console.log('\n✅ All platform tests completed!');
        
        // Cleanup
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

testAllPlatforms();