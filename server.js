const express = require('express');
const { initDB, DB } = require('./src/core/db');
const Scraper = require('./src/core/scraper');
const AI = require('./src/core/ai');
const CONFIG = require('./src/config');

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════

app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// ═══════════════════════════════════════════════
// HEALTH & STATUS ROUTES
// ═══════════════════════════════════════════════

app.get('/', (req, res) => {
    res.json({
        name: 'DealHunt API',
        version: '3.0.0',
        status: 'online',
        platforms: Scraper.getAvailable(),
        endpoints: {
            health: 'GET /health',
            stats: 'GET /stats',
            products: 'GET /api/products',
            scrape: 'POST /trigger/scrape',
            daily: 'POST /trigger/daily',
            cleanup: 'POST /trigger/cleanup'
        }
    });
});

app.get('/health', async (req, res) => {
    try {
        await DB.query('SELECT NOW()');
        res.json({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

app.get('/stats', async (req, res) => {
    try {
        const stats = await DB.getStats();
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════

app.get('/api/config', async (req, res) => {
    const platforms = {};
    for (const name of CONFIG.getActivePlatforms()) {
        platforms[name] = await DB.getPlatformSelectors(name);
    }
    res.json({ platforms });
});

app.get('/api/products', async (req, res) => {
    try {
        const { category, limit = 20, offset = 0 } = req.query;
        
        let query = `
            SELECT p.*, 
                   json_agg(json_build_object(
                       'platform', pl.name,
                       'price', link.current_price,
                       'original_price', link.original_price,
                       'discount', link.discount_percent,
                       'url', link.product_url
                   )) as prices
            FROM products p
            LEFT JOIN product_links link ON link.product_id = p.id
            LEFT JOIN platforms pl ON pl.id = link.platform_id
        `;
        
        const params = [];
        if (category) {
            query += ` WHERE p.category = $1`;
            params.push(category);
        }
        
        query += ` GROUP BY p.id ORDER BY p.last_updated DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(parseInt(limit), parseInt(offset));
        
        const result = await DB.query(query, params);
        res.json({ products: result.rows, count: result.rows.length });
        
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════
// TRIGGER ROUTES (For Cron Jobs)
// ═══════════════════════════════════════════════

// Verify cron secret (optional security)
function verifyCronSecret(req, res, next) {
    const secret = req.headers['x-cron-secret'];
    if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// Manual Scrape Trigger
app.post('/trigger/scrape', verifyCronSecret, async (req, res) => {
    const { platform, query, limit } = req.body;
    
    res.json({ message: 'Scraping started', platform, query });
    
    // Run in background
    setImmediate(async () => {
        try {
            if (platform === 'all') {
                await Scraper.runAll(query || 'smartphones', limit || 10);
            } else {
                await Scraper.run(platform, query || 'smartphones', limit || 20);
            }
            await AI.processQueue(100);
        } catch (e) {
            console.error('Scrape Error:', e);
        }
    });
});

// Daily Automation Trigger
app.post('/trigger/daily', verifyCronSecret, async (req, res) => {
    res.json({ 
        message: 'Daily automation started',
        time: new Date().toISOString()
    });
    
    // Run in background
    setImmediate(async () => {
        try {
            const { runDailyAutomation } = require('./src/scripts/daily-automation');
            await runDailyAutomation();
        } catch (e) {
            console.error('Daily Automation Error:', e);
        }
    });
});

// Monthly Cleanup Trigger
app.post('/trigger/cleanup', verifyCronSecret, async (req, res) => {
    res.json({ 
        message: 'Monthly cleanup started',
        time: new Date().toISOString()
    });
    
    // Run in background
    setImmediate(async () => {
        try {
            const { runMonthlyCleanup } = require('./src/scripts/monthly-cleanup');
            await runMonthlyCleanup();
        } catch (e) {
            console.error('Cleanup Error:', e);
        }
    });
});

// AI Processing Trigger
app.post('/trigger/ai', verifyCronSecret, async (req, res) => {
    const { limit } = req.body;
    
    res.json({ message: 'AI processing started' });
    
    setImmediate(async () => {
        try {
            await AI.processQueue(limit || 100);
        } catch (e) {
            console.error('AI Error:', e);
        }
    });
});

// Healing Trigger
app.post('/api/heal', async (req, res) => {
    const { platform, field, html } = req.body;
    
    if (!platform || !field || !html) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    
    try {
        const newSelector = await AI.healSelector(platform, field, html);
        if (newSelector) {
            res.json({ status: 'healed', selector: newSelector });
        } else {
            res.status(500).json({ status: 'failed' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════

const PORT = CONFIG.PORT;

app.listen(PORT, async () => {
    console.log('\n🚀 DealHunt Backend Starting...\n');
    await initDB();
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`📍 Environment: ${CONFIG.ENV}`);
    console.log(`🔌 Platforms: ${CONFIG.getActivePlatforms().join(', ')}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('👋 Shutting down...');
    process.exit(0);
});