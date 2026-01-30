const redis = require('redis');
require('dotenv').config();

let client = null;

async function connectRedis() {
    if (client && client.isOpen) {
        return client;
    }

    try {
        console.log('🔄 Connecting to Redis...');
        
        client = redis.createClient({
            url: process.env.REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 10) {
                        console.error('❌ Redis reconnect limit exceeded');
                        return new Error('Too many retries');
                    }
                    const delay = Math.min(retries * 100, 3000);
                    console.log(`⏳ Retrying Redis connection in ${delay}ms...`);
                    return delay;
                },
                connectTimeout: 10000,
            }
        });

        client.on('error', (err) => {
            console.error('❌ Redis error:', err.message);
        });

        client.on('connect', () => {
            console.log('🔌 Redis connecting...');
        });

        client.on('ready', () => {
            console.log('✅ Redis ready!');
        });

        client.on('reconnecting', () => {
            console.log('🔄 Redis reconnecting...');
        });

        await client.connect();
        
        // Test ping
        await client.ping();
        console.log('✅ Redis connected successfully');
        
        return client;

    } catch (error) {
        console.error('❌ Redis connection failed:', error.message);
        throw error;
    }
}

// Cache helper functions
const cache = {
    // Get cached data
    async get(key) {
        try {
            const client = await connectRedis();
            const data = await client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error('❌ Cache get error:', error.message);
            return null;
        }
    },

    // Set cache with expiry (default 1 hour = 3600 seconds)
    async set(key, value, expirySeconds = 3600) {
        try {
            const client = await connectRedis();
            await client.setEx(key, expirySeconds, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('❌ Cache set error:', error.message);
            return false;
        }
    },

    // Delete cache
    async del(key) {
        try {
            const client = await connectRedis();
            await client.del(key);
            return true;
        } catch (error) {
            console.error('❌ Cache delete error:', error.message);
            return false;
        }
    },

    // Check if key exists
    async exists(key) {
        try {
            const client = await connectRedis();
            const result = await client.exists(key);
            return result === 1;
        } catch (error) {
            console.error('❌ Cache exists error:', error.message);
            return false;
        }
    },

    // Store scraping status
    async setScrapingStatus(platform, status) {
        return await this.set(`scraping:${platform}`, status, 3600);
    },

    // Get scraping status
    async getScrapingStatus(platform) {
        return await this.get(`scraping:${platform}`);
    },

    // Cache product list (24 hour expiry)
    async cacheProducts(category, products) {
        return await this.set(`products:${category}`, products, 86400);
    },

    // Get cached products
    async getCachedProducts(category) {
        return await this.get(`products:${category}`);
    }
};

module.exports = { connectRedis, cache };