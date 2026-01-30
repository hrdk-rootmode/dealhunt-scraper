require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const AmazonScraper = require('./src/scrapers/amazon-scraper');
const { connectRedis, cache } = require('./src/config/redis');
const { pool } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==================== ROUTES ====================

// Health check endpoint (Render needs this)
app.get('/', (req, res) => {
    res.json({
        status: 'active',
        service: 'DealHunt Scraper',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Health check with database status
app.get('/health', async (req, res) => {
    try {
        // Check database
        await pool.query('SELECT NOW()');
        const dbCheck = true;

        // Check Redis
        const client = await connectRedis();
        await client.ping();
        const redisCheck = true;

        // Get product count
        const result = await pool.query('SELECT COUNT(*) FROM products');
        const productCount = parseInt(result.rows[0].count);

        // Get last scrape
        const lastScrape = await pool.query(`
            SELECT completed_at, status, products_scraped 
            FROM scrape_logs 
            ORDER BY completed_at DESC 
            LIMIT 1
        `);

        res.json({
            status: 'healthy',
            database: dbCheck ? 'connected' : 'disconnected',
            redis: redisCheck ? 'connected' : 'disconnected',
            products: productCount,
            lastScrape: lastScrape.rows[0] || null,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Manual scrape trigger
app.post('/scrape/amazon', async (req, res) => {
    try {
        const { maxProducts = 100 } = req.body;
        
        // Check if scraping is already running
        const status = await cache.getScrapingStatus('Amazon');
        if (status && status.status === 'running') {
            return res.status(409).json({
                status: 'error',
                message: 'Scraping is already in progress',
                currentStatus: status
            });
        }

        res.json({
            status: 'started',
            message: 'Scraping initiated',
            maxProducts: maxProducts
        });

        // Run scraper asynchronously
        const scraper = new AmazonScraper();
        scraper.scrape({ maxProducts })
            .then(() => {
                console.log('✅ Manual scrape completed');
            })
            .catch(err => {
                console.error('❌ Manual scrape failed:', err.message);
            });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get scraping status
app.get('/status/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const status = await cache.getScrapingStatus(platform);
        
        res.json({
            platform: platform,
            status: status || { status: 'idle', message: 'No scraping in progress' }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get recent scrape logs
app.get('/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const result = await pool.query(`
            SELECT 
                sl.*,
                p.name as platform
            FROM scrape_logs sl
            JOIN platforms p ON sl.platform_id = p.id
            ORDER BY sl.started_at DESC
            LIMIT $1
        `, [limit]);

        res.json({
            logs: result.rows,
            count: result.rows.length
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get product stats
app.get('/stats', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.name as platform,
                COUNT(pr.id) as total_products,
                COUNT(CASE WHEN pr.is_available THEN 1 END) as available_products,
                ROUND(AVG(pr.current_price)::numeric, 2) as avg_price,
                MIN(pr.current_price) as min_price,
                MAX(pr.current_price) as max_price,
                MAX(pr.last_updated) as last_updated
            FROM products pr
            JOIN platforms p ON pr.platform_id = p.id
            GROUP BY p.name
        `);

        // Overall stats
        const overall = await pool.query(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(DISTINCT brand) as total_brands,
                COUNT(DISTINCT category) as total_categories,
                ROUND(AVG(current_price)::numeric, 2) as avg_price
            FROM products
            WHERE is_available = true
        `);

        res.json({
            byPlatform: result.rows,
            overall: overall.rows[0]
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Get products (with pagination)
app.get('/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT * FROM product_summary
            ORDER BY last_updated DESC
            LIMIT $1 OFFSET $2
        `, [limit, offset]);

        const countResult = await pool.query('SELECT COUNT(*) FROM products WHERE is_available = true');
        const totalCount = parseInt(countResult.rows[0].count);

        res.json({
            products: result.rows,
            pagination: {
                page: page,
                limit: limit,
                total: totalCount,
                pages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==================== CRON JOBS ====================

// Scheduled scraping job - 2 AM IST daily
// IST = UTC + 5:30, so 2:00 AM IST = 8:30 PM UTC (previous day)
cron.schedule('30 20 * * *', async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🕐 Scheduled scraping started at', new Date().toISOString());
    console.log('='.repeat(50) + '\n');
    
    try {
        const scraper = new AmazonScraper();
        const limit = parseInt(process.env.SCRAPE_LIMIT) || 100;
        
        await scraper.scrape({ maxProducts: limit });
        
        console.log('\n' + '='.repeat(50));
        console.log('✅ Scheduled scraping completed');
        console.log('='.repeat(50) + '\n');
    } catch (error) {
        console.error('\n' + '='.repeat(50));
        console.error('❌ Scheduled scraping failed:', error.message);
        console.error('='.repeat(50) + '\n');
    }
}, {
    timezone: "Asia/Kolkata"
});

console.log('⏰ Cron job scheduled: Daily at 2:00 AM IST (20:30 UTC)');

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        path: req.path
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({
        status: 'error',
        message: err.message
    });
});

// ==================== SERVER STARTUP ====================

async function startServer() {
    try {
        // Test database
        console.log('🔌 Connecting to database...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected');

        // Connect Redis
        console.log('🔌 Connecting to Redis...');
        await connectRedis();
        console.log('✅ Redis connected');

        // Start server
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(50));
            console.log('🚀 DealHunt Scraper Server');
            console.log('='.repeat(50));
            console.log(`📡 Server running on port ${PORT}`);
            console.log(`🌐 Local: http://localhost:${PORT}`);
            console.log(`📅 Scheduled scraping: Daily at 2:00 AM IST`);
            console.log(`🎯 Scrape limit: ${process.env.SCRAPE_LIMIT || 100} products`);
            console.log('='.repeat(50) + '\n');
        });

    } catch (error) {
        console.error('❌ Server startup failed:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('👋 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

startServer();