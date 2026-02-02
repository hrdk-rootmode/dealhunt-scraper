const express = require('express');
const rateLimit = require('express-rate-limit');
const { v4: uuid } = require('uuid');
const { initDB, DB } = require('./src/core/db');
const Scraper = require('./src/core/scraper');
const AI = require('./src/core/ai');
const CONFIG = require('./src/config');
const Auth = require('./src/api/auth');
const CacheScheduler = require('./src/scripts/cache-trending');

const app = express();
app.use(express.json());

// ═══════════════════════════════════════════════
// GLOBAL MIDDLEWARE
// ═══════════════════════════════════════════════

// Request ID Middleware (for tracing)
app.use((req, res, next) => {
    req.id = req.headers['x-request-id'] || uuid();
    res.setHeader('x-request-id', req.id);
    next();
});

// Rate Limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 mins
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Logging with Request ID
app.use((req, res, next) => {
    console.log(`[${req.id}] ${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
});

// Initialize Services
Auth.init();
CacheScheduler.init().catch(console.error);

// ═══════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════

// Public Routes (Products, Search, etc.)
app.use('/api', require('./src/routes/public'));

// User Routes (Wishlist, Profile, Payments) - Protected
app.use('/api/user', require('./src/routes/user'));

// Admin Routes (Dashboard) - Protected
app.use('/admin', require('./src/routes/admin'));

// System Routes
app.get('/', (req, res) => res.json({ 
    status: 'online', 
    version: '3.0.0', 
    admob: CONFIG.ADMOB // Send AdMob IDs to app
}));

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
// AUTOMATION TRIGGERS (Secure)
// ═══════════════════════════════════════════════

function verifyCron(req, res, next) {
    if (req.headers['x-cron-secret'] === CONFIG.CRON_SECRET) return next();
    if (CONFIG.ENV === 'development') return next(); // Allow in dev without secret
    return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/trigger/scrape', verifyCron, (req, res) => {
    res.json({ message: 'Scraping started' });
    
    setImmediate(async () => {
        try {
            const { platform, query, limit } = req.body;
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

app.post('/trigger/daily', verifyCron, (req, res) => {
    res.json({ message: 'Daily automation started' });
    
    setImmediate(async () => {
        try {
            const { runDailyAutomation } = require('./src/scripts/daily-automation');
            await runDailyAutomation();
        } catch (e) {
            console.error('Daily Automation Error:', e);
        }
    });
});

app.post('/trigger/cleanup', verifyCron, (req, res) => {
    res.json({ message: 'Cleanup started' });
    
    setImmediate(async () => {
        try {
            const { runMonthlyCleanup } = require('./src/scripts/monthly-cleanup');
            await runMonthlyCleanup();
        } catch (e) {
            console.error('Cleanup Error:', e);
        }
    });
});

app.post('/trigger/ai', verifyCron, (req, res) => {
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

// Healing Trigger (For App fallback)
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
// GLOBAL ERROR HANDLERS (CRITICAL FIX #1)
// ═══════════════════════════════════════════════

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ 
        error: 'Route not found',
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
    });
});

// Global Error Handler (MUST BE LAST)
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || err.status || 500;
    const isDev = CONFIG.ENV === 'development';
    
    console.error('🔴 ERROR:', {
        message: err.message,
        status: statusCode,
        path: req.path,
        method: req.method,
        stack: isDev ? err.stack : undefined,
        timestamp: new Date().toISOString()
    });
    
    res.status(statusCode).json({
        error: isDev ? err.message : 'Internal server error',
        status: statusCode,
        requestId: req.id || 'unknown',
        timestamp: new Date().toISOString()
    });
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