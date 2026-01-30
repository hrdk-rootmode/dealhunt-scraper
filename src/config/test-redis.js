require('dotenv').config();
const { connectRedis, cache } = require('./redis');

async function testRedis() {
    console.log('🧪 Testing Redis Connection...\n');

    try {
        // Check if REDIS_URL exists
        if (!process.env.REDIS_URL) {
            throw new Error('REDIS_URL not found in .env file');
        }

        console.log('✅ REDIS_URL found in .env\n');

        // Test connection
        console.log('1️⃣ Connecting to Redis...');
        const client = await connectRedis();
        console.log('✅ Connected!\n');

        // Test PING
        console.log('2️⃣ Testing PING...');
        const pingResult = await client.ping();
        console.log('✅ PING response:', pingResult, '\n');

        // Test SET
        console.log('3️⃣ Testing SET operation...');
        await cache.set('test_key', { message: 'Hello from Railway Redis!' }, 60);
        console.log('✅ Data stored\n');

        // Test GET
        console.log('4️⃣ Testing GET operation...');
        const data = await cache.get('test_key');
        console.log('✅ Retrieved data:', data, '\n');

        // Test EXISTS
        console.log('5️⃣ Testing EXISTS operation...');
        const exists = await cache.exists('test_key');
        console.log('✅ Key exists:', exists, '\n');

        // Test DELETE
        console.log('6️⃣ Testing DELETE operation...');
        await cache.del('test_key');
        const afterDelete = await cache.get('test_key');
        console.log('✅ After delete:', afterDelete === null ? 'null (correct)' : 'ERROR', '\n');

        // Test scraping status helpers
        console.log('7️⃣ Testing scraping status helpers...');
        await cache.setScrapingStatus('Amazon', {
            status: 'running',
            started: new Date().toISOString()
        });
        const status = await cache.getScrapingStatus('Amazon');
        console.log('✅ Scraping status:', status, '\n');

        console.log('🎉 All Redis tests passed!\n');
        
        await client.quit();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Redis test failed:', error.message);
        console.error('Full error:', error);
        process.exit(1);
    }
}

testRedis();