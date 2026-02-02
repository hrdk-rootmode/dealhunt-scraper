const cron = require('node-cron');
const { createClient } = require('redis');
const CONFIG = require('../config');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════
// REDIS CACHING SCHEDULER
// ═══════════════════════════════════════════

let redis = null;

async function initRedis() {
    if (!CONFIG.REDIS_URL) {
        console.log('⚠️  Redis not configured (REDIS_URL missing)');
        return;
    }
    
    try {
        redis = createClient({ url: CONFIG.REDIS_URL });
        redis.on('error', err => console.error('Redis Error:', err.message));
        await redis.connect();
        console.log('✅ Redis Connected for Cache Job');
    } catch (e) {
        console.error('❌ Redis connection failed:', e.message);
        redis = null;
    }
}

// Load trending data from JSON file to Redis (runs at 5 PM daily)
async function cacheTrendingData() {
    try {
        const filePath = path.join(__dirname, '../../data/trending/categories.json');
        
        if (!fs.existsSync(filePath)) {
            console.log('⚠️  Trending data file not found');
            return;
        }
        
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        
        if (redis && redis.isOpen) {
            // Store in Redis with 24-hour TTL (86400 seconds)
            await redis.setEx('trending:categories', 86400, JSON.stringify(data));
            console.log(`🔥 Trending cached to Redis | Updated: ${data.lastUpdated}`);
        } else {
            console.log('⚠️  Redis not connected, skipping cache');
        }
    } catch (e) {
        console.error('❌ Cache trending error:', e.message);
    }
}

// Schedule the cron job
function scheduleCache() {
    // Run at 5 AM every day (05:00) - synced with Render health check at 10-minute intervals
    cron.schedule('0 5 * * *', () => {
        console.log('🕐 Running daily trending cache job (5 AM)');
        cacheTrendingData();
    });
    
    console.log('✅ Cache scheduler initialized (runs at 5 AM daily)');
}

// Initialize on startup
async function init() {
    await initRedis();
    scheduleCache();
    
    // Also cache on startup
    console.log('📌 Caching trending on startup');
    await cacheTrendingData();
}

module.exports = { init, cacheTrendingData };

// Run if called directly
if (require.main === module) {
    init().catch(console.error);
}
