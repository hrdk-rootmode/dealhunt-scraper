require('dotenv').config();
const express = require('express');
const cron = require('node-cron');
const platformLoader = require('./src/scrapers/core/platform-loader');
const { connectRedis, cache } = require('./src/config/redis');
const { pool } = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 3000;

// ==================== MIDDLEWARE ====================

app.use(express.json());

// Request logging
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// ==================== ROUTES ====================

// Health check endpoint (Render needs this)
app.get('/', (req, res) => {
    const platforms = platformLoader.listPlatforms();
    res.json({
        status: 'active',
        service: 'DealHunt Scraper',
        version: '2.0.0',
        architecture: 'modular',
        platforms: platforms,
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

        // Get available platforms
        const platforms = platformLoader.listPlatforms();

        // Get last scrape per platform
        const lastScrapes = await pool.query(`
            SELECT 
                p.name as platform,
                sl.completed_at, 
                sl.status, 
                sl.products_scraped 
            FROM scrape_logs sl
            JOIN platforms p ON sl.platform_id = p.id
            WHERE sl.completed_at = (
                SELECT MAX(completed_at) 
                FROM scrape_logs sl2 
                WHERE sl2.platform_id = sl.platform_id
            )
            ORDER BY p.name
        `);

        res.json({
            status: 'healthy',
            database: dbCheck ? 'connected' : 'disconnected',
            redis: redisCheck ? 'connected' : 'disconnected',
            products: productCount,
            availablePlatforms: platforms,
            lastScrapes: lastScrapes.rows,
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

// List available platforms
app.get('/platforms', (req, res) => {
    const platforms = platformLoader.listPlatforms();
    res.json({
        platforms: platforms,
        count: platforms.length,
        endpoints: platforms.map(p => ({
            platform: p,
            scrapeUrl: `/scrape/${p.toLowerCase()}`,
            statusUrl: `/status/${p.toLowerCase()}`
        }))
    });
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

// Get products with AI data
app.get('/products/ai', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;

        const result = await pool.query(`
            SELECT 
                p.id,
                p.product_id,
                pl.name as platform,
                p.title,
                p.brand,
                p.category,
                p.ai_category,
                p.subcategory,
                p.ai_tags,
                p.current_price,
                p.original_price,
                p.discount_percent,
                p.rating,
                p.review_count,
                p.image_url,
                p.product_url,
                p.is_available,
                p.ai_processed,
                p.last_updated
            FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            WHERE p.is_available = true
            ORDER BY p.last_updated DESC
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

// ==================== DYNAMIC SCRAPING ROUTES ====================

// Dynamic scrape trigger for any platform
app.post('/scrape/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { maxProducts = 5 } = req.body;
        const platformLower = platform.toLowerCase();
        
        // Handle "all" as special case
        if (platformLower === 'all') {
            return handleScrapeAll(req, res);
        }
        
        // Check if platform exists
        const availablePlatforms = platformLoader.getAvailablePlatforms();
        if (!availablePlatforms.includes(platformLower)) {
            return res.status(404).json({
                status: 'error',
                message: `Platform '${platform}' not found`,
                availablePlatforms: availablePlatforms
            });
        }
        
        // Check if scraping is already running
        const status = await cache.getScrapingStatus(platformLower);
        if (status && status.status === 'running') {
            return res.status(409).json({
                status: 'error',
                message: 'Scraping is already in progress',
                platform: platformLower,
                currentStatus: status
            });
        }

        res.json({
            status: 'started',
            message: `Scraping ${platformLower} initiated`,
            platform: platformLower,
            maxProducts: maxProducts
        });

        // Run scraper asynchronously
        const scraper = platformLoader.getScraper(platformLower);
        scraper.scrape({ maxProducts })
            .then((results) => {
                console.log(`✅ Manual ${platformLower} scrape completed: ${results?.length || 0} products`);
            })
            .catch(err => {
                console.error(`❌ Manual ${platformLower} scrape failed:`, err.message);
            });

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Helper function for scraping all platforms
async function handleScrapeAll(req, res) {
    try {
        const { maxProducts = 100 } = req.body;
        const platforms = platformLoader.getAvailablePlatforms();
        
        res.json({
            status: 'started',
            message: 'Scraping all platforms initiated',
            platforms: platforms,
            maxProducts: maxProducts
        });

        // Run scrapers sequentially (to avoid overwhelming resources)
        (async () => {
            const results = {};
            for (const platform of platforms) {
                try {
                    console.log(`\n${'='.repeat(40)}`);
                    console.log(`🚀 Starting ${platform} scrape...`);
                    console.log('='.repeat(40));
                    
                    const scraper = platformLoader.getScraper(platform);
                    const scraped = await scraper.scrape({ maxProducts });
                    results[platform] = { 
                        status: 'success', 
                        products: scraped?.length || 0 
                    };
                    console.log(`✅ ${platform} scrape completed: ${scraped?.length || 0} products`);
                    
                    // Small delay between platforms
                    await new Promise(r => setTimeout(r, 5000));
                    
                } catch (err) {
                    results[platform] = { 
                        status: 'failed', 
                        error: err.message 
                    };
                    console.error(`❌ ${platform} scrape failed:`, err.message);
                }
            }
            
            console.log('\n' + '='.repeat(50));
            console.log('📊 All Platforms Scrape Summary:');
            console.log(JSON.stringify(results, null, 2));
            console.log('='.repeat(50) + '\n');
        })();

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
}

// ==================== PRODUCT REFRESH ROUTE ====================

// Refresh individual product
app.post('/products/:id/refresh', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Get product from database
        const result = await pool.query(`
            SELECT p.*, pl.name as platform_name
            FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            WHERE p.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Product with ID ${id} not found`
            });
        }
        
        const product = result.rows[0];
        const platformName = product.platform_name.toLowerCase();
        
        // Check if scraper available for this platform
        const availablePlatforms = platformLoader.getAvailablePlatforms();
        if (!availablePlatforms.includes(platformName)) {
            return res.status(400).json({
                status: 'error',
                message: `No scraper available for platform: ${platformName}`,
                availablePlatforms: availablePlatforms
            });
        }
        
        // Check if product URL exists
        if (!product.product_url) {
            return res.status(400).json({
                status: 'error',
                message: 'Product URL not found in database'
            });
        }
        
        res.json({
            status: 'refreshing',
            message: `Refreshing product ${id} from ${platformName}`,
            productId: id,
            platform: platformName,
            productUrl: product.product_url
        });
        
        // Refresh asynchronously
        const scraper = platformLoader.getScraper(platformName);
        
        // Check if refreshProduct method exists, otherwise use scrapeProductPage
        if (typeof scraper.refreshProduct === 'function') {
            scraper.refreshProduct(product.product_url)
                .then((refreshedProduct) => {
                    console.log(`✅ Product ${id} refreshed successfully`);
                })
                .catch(err => {
                    console.error(`❌ Product ${id} refresh failed:`, err.message);
                });
        } else if (typeof scraper.scrapeProductPage === 'function') {
            scraper.scrapeProductPage(product.product_url)
                .then((refreshedProduct) => {
                    console.log(`✅ Product ${id} refreshed successfully via scrapeProductPage`);
                })
                .catch(err => {
                    console.error(`❌ Product ${id} refresh failed:`, err.message);
                });
        } else {
            console.error(`❌ No refresh method available for ${platformName}`);
        }

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// Bulk refresh products by platform
app.post('/products/refresh/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const { limit = 10, olderThan = 24 } = req.body; // olderThan in hours
        const platformLower = platform.toLowerCase();
        
        // Validate platform
        const availablePlatforms = platformLoader.getAvailablePlatforms();
        if (!availablePlatforms.includes(platformLower)) {
            return res.status(404).json({
                status: 'error',
                message: `Platform '${platform}' not found`,
                availablePlatforms: availablePlatforms
            });
        }
        
        // Get stale products
        const result = await pool.query(`
            SELECT p.id, p.product_url, p.title, p.last_updated
            FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            WHERE pl.name ILIKE $1
              AND p.is_available = true
              AND p.last_updated < NOW() - INTERVAL '${olderThan} hours'
            ORDER BY p.last_updated ASC
            LIMIT $2
        `, [platformLower, limit]);
        
        if (result.rows.length === 0) {
            return res.json({
                status: 'success',
                message: 'No stale products found to refresh',
                platform: platformLower
            });
        }
        
        res.json({
            status: 'started',
            message: `Refreshing ${result.rows.length} products from ${platformLower}`,
            platform: platformLower,
            productsToRefresh: result.rows.length
        });
        
        // Refresh asynchronously
        (async () => {
            const scraper = platformLoader.getScraper(platformLower);
            let refreshed = 0;
            let failed = 0;
            
            for (const product of result.rows) {
                try {
                    if (typeof scraper.refreshProduct === 'function') {
                        await scraper.refreshProduct(product.product_url);
                    } else if (typeof scraper.scrapeProductPage === 'function') {
                        await scraper.scrapeProductPage(product.product_url);
                    }
                    refreshed++;
                    console.log(`✅ Refreshed: ${product.title?.substring(0, 50)}...`);
                    
                    // Rate limiting
                    await new Promise(r => setTimeout(r, 2000));
                    
                } catch (err) {
                    failed++;
                    console.error(`❌ Failed to refresh ${product.id}:`, err.message);
                }
            }
            
            console.log(`\n📊 Bulk refresh complete: ${refreshed} success, ${failed} failed`);
        })();

    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==================== STATUS ROUTES ====================

// Get scraping status
app.get('/status/:platform', async (req, res) => {
    try {
        const { platform } = req.params;
        const platformLower = platform.toLowerCase();
        
        // Validate platform (allow 'all' as special case)
        if (platformLower !== 'all') {
            const availablePlatforms = platformLoader.getAvailablePlatforms();
            if (!availablePlatforms.includes(platformLower)) {
                return res.status(404).json({
                    status: 'error',
                    message: `Platform '${platform}' not found`,
                    availablePlatforms: availablePlatforms
                });
            }
        }
        
        if (platformLower === 'all') {
            const platforms = platformLoader.getAvailablePlatforms();
            const statuses = {};
            
            for (const p of platforms) {
                statuses[p] = await cache.getScrapingStatus(p) || { 
                    status: 'idle', 
                    message: 'No scraping in progress' 
                };
            }
            
            return res.json({
                platforms: statuses
            });
        }
        
        const status = await cache.getScrapingStatus(platformLower);
        
        res.json({
            platform: platformLower,
            status: status || { status: 'idle', message: 'No scraping in progress' }
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==================== LOGS ROUTE ====================

// Get recent scrape logs
app.get('/logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const platform = req.query.platform;
        
        let query = `
            SELECT 
                sl.*,
                p.name as platform
            FROM scrape_logs sl
            JOIN platforms p ON sl.platform_id = p.id
        `;
        
        const params = [limit];
        
        if (platform) {
            query += ` WHERE p.name ILIKE $2`;
            params.push(platform);
        }
        
        query += ` ORDER BY sl.started_at DESC LIMIT $1`;

        const result = await pool.query(query, params);

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

// ==================== STATS ROUTE ====================

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
                ROUND(AVG(pr.rating)::numeric, 2) as avg_rating,
                SUM(pr.review_count) as total_reviews,
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
                ROUND(AVG(current_price)::numeric, 2) as avg_price,
                ROUND(AVG(rating)::numeric, 2) as avg_rating,
                SUM(review_count) as total_reviews
            FROM products
            WHERE is_available = true
        `);

        // Available scrapers
        const availablePlatforms = platformLoader.getAvailablePlatforms();

        res.json({
            byPlatform: result.rows,
            overall: overall.rows[0],
            availableScrapers: availablePlatforms
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message
        });
    }
});

// ==================== PRODUCTS ROUTES ====================

// Get products (with pagination)
app.get('/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const platform = req.query.platform;

        let query = `SELECT * FROM product_summary`;
        let countQuery = `SELECT COUNT(*) FROM products WHERE is_available = true`;
        const params = [limit, offset];

        if (platform) {
            query = `
                SELECT ps.* FROM product_summary ps
                WHERE ps.platform ILIKE $3
            `;
            countQuery = `
                SELECT COUNT(*) FROM products p
                JOIN platforms pl ON p.platform_id = pl.id
                WHERE p.is_available = true AND pl.name ILIKE $1
            `;
            params.push(platform);
        }

        query += ` ORDER BY last_updated DESC LIMIT $1 OFFSET $2`;

        const result = await pool.query(query, params);
        
        const countResult = platform 
            ? await pool.query(countQuery, [platform])
            : await pool.query(countQuery);
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

// Get products with AI data
app.get('/products/ai', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const offset = (page - 1) * limit;
        const platform = req.query.platform;
        const aiProcessed = req.query.ai_processed;

        let whereConditions = ['p.is_available = true'];
        const params = [limit, offset];
        let paramIndex = 3;

        if (platform) {
            whereConditions.push(`pl.name ILIKE $${paramIndex}`);
            params.push(platform);
            paramIndex++;
        }

        if (aiProcessed !== undefined) {
            whereConditions.push(`p.ai_processed = $${paramIndex}`);
            params.push(aiProcessed === 'true');
            paramIndex++;
        }

        const whereClause = whereConditions.length > 0 
            ? `WHERE ${whereConditions.join(' AND ')}` 
            : '';

        const result = await pool.query(`
            SELECT 
                p.id,
                p.product_id,
                pl.name as platform,
                p.title,
                p.brand,
                p.category,
                p.ai_category,
                p.subcategory,
                p.ai_tags,
                p.current_price,
                p.original_price,
                p.discount_percent,
                p.rating,
                p.review_count,
                p.image_url,
                p.product_url,
                p.is_available,
                p.ai_processed,
                p.last_updated
            FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            ${whereClause}
            ORDER BY p.last_updated DESC
            LIMIT $1 OFFSET $2
        `, params);

        // Count query
        const countParams = params.slice(2); // Remove limit and offset
        const countResult = await pool.query(`
            SELECT COUNT(*) FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            ${whereClause.replace(/\$(\d+)/g, (_, n) => `$${parseInt(n) - 2}`)}
        `, countParams.length > 0 ? countParams : undefined);
        
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

// Get single product by ID
app.get('/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(`
            SELECT 
                p.*,
                pl.name as platform
            FROM products p
            JOIN platforms pl ON p.platform_id = pl.id
            WHERE p.id = $1
        `, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: 'error',
                message: `Product with ID ${id} not found`
            });
        }

        res.json({
            product: result.rows[0]
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
    console.log('\n' + '='.repeat(60));
    console.log('🕐 Scheduled Multi-Platform Scraping Started');
    console.log(`📅 Time: ${new Date().toISOString()}`);
    console.log('='.repeat(60) + '\n');
    
    try {
        const platforms = platformLoader.getAvailablePlatforms();
        const limit = parseInt(process.env.SCRAPE_LIMIT) || 100;
        const results = {};
        
        console.log(`📋 Platforms to scrape: ${platforms.join(', ')}`);
        console.log(`🎯 Product limit per platform: ${limit}\n`);
        
        for (const platform of platforms) {
            console.log('\n' + '-'.repeat(40));
            console.log(`🚀 Starting ${platform.toUpperCase()} scrape...`);
            console.log('-'.repeat(40));
            
            try {
                const scraper = platformLoader.getScraper(platform);
                const startTime = Date.now();
                const scraped = await scraper.scrape({ maxProducts: limit });
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                
                results[platform] = { 
                    status: 'success', 
                    products: scraped?.length || 0,
                    duration: `${duration}s`
                };
                
                console.log(`✅ ${platform}: ${scraped?.length || 0} products in ${duration}s`);
                
                // Delay between platforms to be respectful
                if (platforms.indexOf(platform) < platforms.length - 1) {
                    console.log('⏳ Waiting 10 seconds before next platform...');
                    await new Promise(r => setTimeout(r, 10000));
                }
                
            } catch (err) {
                results[platform] = { 
                    status: 'failed', 
                    error: err.message 
                };
                console.error(`❌ ${platform} failed:`, err.message);
            }
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('📊 SCHEDULED SCRAPE SUMMARY');
        console.log('='.repeat(60));
        Object.entries(results).forEach(([platform, result]) => {
            const icon = result.status === 'success' ? '✅' : '❌';
            const info = result.status === 'success' 
                ? `${result.products} products (${result.duration})`
                : result.error;
            console.log(`${icon} ${platform}: ${info}`);
        });
        console.log('='.repeat(60));
        console.log(`⏱️  Completed at: ${new Date().toISOString()}`);
        console.log('='.repeat(60) + '\n');
        
    } catch (error) {
        console.error('\n' + '='.repeat(60));
        console.error('❌ SCHEDULED SCRAPING FAILED');
        console.error('Error:', error.message);
        console.error('='.repeat(60) + '\n');
    }
}, {
    timezone: "Asia/Kolkata"
});

// Log cron job info
const platforms = platformLoader.getAvailablePlatforms();
console.log(`⏰ Cron job scheduled: Daily at 2:00 AM IST (20:30 UTC)`);
console.log(`📋 Platforms configured: ${platforms.join(', ')}`);

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        path: req.path,
        availableRoutes: [
            'GET  /',
            'GET  /health',
            'GET  /platforms',
            'POST /scrape/:platform',
            'POST /scrape/all',
            'GET  /status/:platform',
            'GET  /logs',
            'GET  /stats',
            'GET  /products',
            'GET  /products/ai',
            'GET  /products/:id',
            'POST /products/:id/refresh',
            'POST /products/refresh/:platform'
        ]
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

        // Load platforms
        console.log('🔌 Loading platform scrapers...');
        const loadedPlatforms = platformLoader.getAvailablePlatforms();
        console.log(`✅ Loaded ${loadedPlatforms.length} platforms: ${loadedPlatforms.join(', ')}`);

        // Start server
        app.listen(PORT, () => {
            console.log('\n' + '='.repeat(60));
            console.log('🚀 DealHunt Scraper Server v2.0 (Modular Architecture)');
            console.log('='.repeat(60));
            console.log(`📡 Server running on port ${PORT}`);
            console.log(`🌐 Local: http://localhost:${PORT}`);
            console.log(`📅 Scheduled scraping: Daily at 2:00 AM IST`);
            console.log(`🎯 Scrape limit: ${process.env.SCRAPE_LIMIT || 100} products per platform`);
            console.log(`🔧 Available platforms: ${loadedPlatforms.join(', ')}`);
            console.log('='.repeat(60));
            console.log('📚 API Endpoints:');
            console.log('   GET  /              - Service info');
            console.log('   GET  /health        - Health check');
            console.log('   GET  /platforms     - List scrapers');
            console.log('   POST /scrape/:platform - Trigger scrape');
            console.log('   POST /scrape/all    - Scrape all platforms');
            console.log('   GET  /status/:platform - Scrape status');
            console.log('   POST /products/:id/refresh - Refresh product');
            console.log('   GET  /products      - List products');
            console.log('   GET  /stats         - Statistics');
            console.log('='.repeat(60) + '\n');
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