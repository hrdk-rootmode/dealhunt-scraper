const { Pool } = require('pg');
const { createClient } = require('redis');
const CONFIG = require('../config');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
// CONNECTIONS
// ═══════════════════════════════════════════════

// CRITICAL FIX #4: Add query timeout to prevent hanging queries
const pool = new Pool({
    connectionString: CONFIG.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 30,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 30000  // Kill query if it takes > 30 seconds
});

let redis = null;
if (CONFIG.REDIS_URL) {
    redis = createClient({ url: CONFIG.REDIS_URL });
    redis.on('error', err => console.error('❌ Redis:', err.message));
}

// ═══════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════

async function initDB() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ PostgreSQL Connected');
        
        if (redis && !redis.isOpen) {
            await redis.connect();
            console.log('✅ Redis Connected');
        }
        
        await syncPlatforms();
    } catch (e) {
        console.error('❌ Database Connection Failed:', e.message);
        process.exit(1);
    }
}

async function syncPlatforms() {
    const platforms = CONFIG.PLATFORMS;
    for (const [name, config] of Object.entries(platforms)) {
        try {
            await pool.query(`
                INSERT INTO platforms (name, base_url, selectors, is_active)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (name) DO UPDATE SET
                    base_url = EXCLUDED.base_url,
                    is_active = EXCLUDED.is_active
            `, [name, config.base_url, config.selectors, config.isActive]);
        } catch (e) {
            console.error(`Sync Error ${name}:`, e.message);
        }
    }
    console.log('✅ Platforms synced to DB');
}

// ═══════════════════════════════════════════════
// FINGERPRINT GENERATOR
// ═══════════════════════════════════════════════

function generateFingerprint(title) {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 6)
        .join('-')
        .substring(0, 100);
}

// ═══════════════════════════════════════════════
// DATABASE API
// ═══════════════════════════════════════════════

const DB = {
    query: (text, params) => pool.query(text, params),
    
    // ═══════════════════════════════════════════
    // PLATFORM SELECTORS
    // ═══════════════════════════════════════════
    
    getPlatformSelectors: async (name) => {
        try {
            const res = await pool.query('SELECT selectors FROM platforms WHERE name = $1', [name]);
            if (res.rows.length > 0 && res.rows[0].selectors) {
                return res.rows[0].selectors;
            }
        } catch (e) {
            console.error('DB Selector Error:', e.message);
        }
        return CONFIG.getSelectors(name);
    },
    
    // ═══════════════════════════════════════════
    // BULK UPSERT PRODUCTS
    // ═══════════════════════════════════════════
    
    bulkUpsertProducts: async (products, platformName) => {
        if (!products || products.length === 0) return { saved: 0, failed: 0, duplicates: 0 };
        
        const client = await pool.connect();
        let saved = 0;
        let failed = 0;
        let duplicates = 0;
        
        try {
            const platRes = await client.query('SELECT id FROM platforms WHERE name = $1', [platformName]);
            if (platRes.rows.length === 0) throw new Error(`Platform ${platformName} not found`);
            const platformId = platRes.rows[0].id;
            
            await client.query('BEGIN');
            
            for (const data of products) {
                try {
                    if (!data.title || !data.current_price) continue;
                    
                    const fingerprint = generateFingerprint(data.title);
                    
                    const existsCheck = await client.query(`
                        SELECT id FROM product_links 
                        WHERE platform_id = $1 AND external_id = $2
                    `, [platformId, data.product_id]);
                    
                    if (existsCheck.rows.length > 0) {
                        await client.query(`
                            UPDATE product_links 
                            SET current_price = $1, 
                                original_price = $2,
                                discount_percent = $3,
                                rating = $4,
                                review_count = $5,
                                last_scraped = NOW()
                            WHERE platform_id = $6 AND external_id = $7
                        `, [
                            data.current_price,
                            data.original_price || data.current_price,
                            data.discount_percent || 0,
                            data.rating || 0,
                            data.review_count || 0,
                            platformId,
                            data.product_id
                        ]);
                        duplicates++;
                        continue;
                    }
                    
                    const productRes = await client.query(`
                        INSERT INTO products (fingerprint, title, brand, category, image_url, specifications, ai_processed)
                        VALUES ($1, $2, $3, $4, $5, $6, false)
                        ON CONFLICT (fingerprint) DO UPDATE SET 
                            title = EXCLUDED.title,
                            image_url = COALESCE(EXCLUDED.image_url, products.image_url),
                            category = COALESCE(EXCLUDED.category, products.category),
                            last_updated = NOW()
                        RETURNING id
                    `, [
                        fingerprint,
                        data.title,
                        data.brand || null,
                        data.category || null,
                        data.image_url || null,
                        JSON.stringify(data.specifications || {})
                    ]);
                    
                    const productId = productRes.rows[0].id;
                    
                    const linkRes = await client.query(`
                        INSERT INTO product_links (
                            product_id, platform_id, external_id, product_url, 
                            current_price, original_price, discount_percent,
                            rating, review_count, in_stock, is_verified, last_scraped
                        )
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true, NOW())
                        RETURNING id
                    `, [
                        productId, platformId, data.product_id, data.product_url || null,
                        data.current_price || 0, data.original_price || data.current_price || 0,
                        data.discount_percent || 0, data.rating || 0, data.review_count || 0,
                        data.is_available !== false
                    ]);
                    
                    if (data.current_price > 0) {
                        await client.query(`
                            INSERT INTO price_history (link_id, price) VALUES ($1, $2)
                        `, [linkRes.rows[0].id, data.current_price]);
                    }
                    
                    saved++;
                } catch (e) {
                    failed++;
                }
            }
            
            await client.query('COMMIT');
            
            if (duplicates > 0) {
                console.log(`   📝 Updated ${duplicates} existing products`);
            }
            
        } catch (e) {
            await client.query('ROLLBACK');
            console.error(`❌ Bulk Insert Failed:`, e.message);
        } finally {
            client.release();
        }
        
        return { saved, failed, duplicates };
    },
    
    // ═══════════════════════════════════════════
    // USER MANAGEMENT
    // ═══════════════════════════════════════════
    
    getOrCreateUser: async (userData) => {
        try {
            const result = await pool.query(`
                INSERT INTO users (firebase_uid, email, display_name, photo_url, last_login)
                VALUES ($1, $2, $3, $4, NOW())
                ON CONFLICT (email) DO UPDATE SET
                    firebase_uid = EXCLUDED.firebase_uid,
                    display_name = EXCLUDED.display_name,
                    photo_url = EXCLUDED.photo_url,
                    last_login = NOW()
                RETURNING id, email, display_name, subscription_plan, subscription_expires_at, 
                          daily_search_count, last_search_reset, is_blocked
            `, [userData.firebase_uid, userData.email, userData.display_name, userData.photo_url]);
            
            return result.rows[0];
        } catch (e) {
            console.error('Get/Create User Error:', e.message);
            throw e;
        }
    },
    
    // ═══════════════════════════════════════════
    // TRENDING DATA (Redis Cache)
    // ═══════════════════════════════════════════
    
    getTrendingData: async () => {
        try {
            // Try Redis first (5-10ms)
            if (redis && redis.isOpen) {
                const cached = await redis.get('trending:categories');
                if (cached) {
                    console.log('⚡ Trending Cache HIT');
                    return JSON.parse(cached);
                }
            }
            
            // Fall back to JSON file (50ms)
            const filePath = path.join(__dirname, '../../data/trending/categories.json');
            if (fs.existsSync(filePath)) {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                
                // Store in Redis for next request (24-hour TTL)
                if (redis && redis.isOpen) {
                    await redis.setEx('trending:categories', 86400, JSON.stringify(data));
                }
                
                // Also store in PostgreSQL trending_data table
                try {
                    await pool.query(`
                        INSERT INTO trending_data (categories, last_updated)
                        VALUES ($1, NOW())
                        ON CONFLICT (id) DO UPDATE SET
                            categories = EXCLUDED.categories,
                            last_updated = NOW()
                    `, [JSON.stringify(data.trending)]);
                } catch (e) {
                    // Table might not exist, continue anyway
                }
                
                return data;
            }
            
            // Fallback: return empty trending
            return { trending: [], platformCategories: {}, lastUpdated: new Date().toISOString() };
        } catch (e) {
            console.error('Trending fetch error:', e.message);
            return { trending: [], platformCategories: {}, lastUpdated: new Date().toISOString() };
        }
    },
    
    // ═══════════════════════════════════════════
    // SIMILAR PRODUCTS (Based on Average Views)
    // ═══════════════════════════════════════════
    
    getSimilarProducts: async (productId, limit = 5) => {
        try {
            // Get average view count across all products
            const avgRes = await pool.query(`
                SELECT AVG(views_count) as avg_views FROM products WHERE views_count > 0
            `);
            const avgViews = parseInt(avgRes.rows[0]?.avg_views) || 10;
            
            // Get product info
            const productRes = await pool.query(`
                SELECT category FROM products WHERE id = $1
            `, [productId]);
            
            if (productRes.rows.length === 0) return [];
            
            const category = productRes.rows[0].category;
            
            // Get similar products (same category, around average views, not most viewed)
            const similarRes = await pool.query(`
                SELECT p.id, p.title, p.image_url, p.category,
                       json_agg(json_build_object(
                           'platform', pl.name,
                           'price', link.current_price,
                           'url', link.product_url
                       )) as prices
                FROM products p
                LEFT JOIN product_links link ON link.product_id = p.id
                LEFT JOIN platforms pl ON pl.id = link.platform_id
                WHERE p.category = $1 
                  AND p.id != $2
                  AND p.views_count BETWEEN ($3 - 50) AND ($3 + 50)
                GROUP BY p.id
                ORDER BY ABS(p.views_count - $3) ASC
                LIMIT $4
            `, [category, productId, avgViews, limit]);
            
            return similarRes.rows;
        } catch (e) {
            console.error('Similar products error:', e.message);
            return [];
        }
    },
    
    // ═══════════════════════════════════════════
    // CACHED PRODUCT FETCHING
    // ═══════════════════════════════════════════
    
    getProductsCached: async (params) => {
        const { category, limit, offset, query } = params;
        
        const cacheKey = `api:products:${category || 'all'}:${query || 'none'}:${limit}:${offset}`;
        
        if (redis && redis.isOpen) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    console.log('⚡ Cache HIT');
                    return JSON.parse(cached);
                }
            } catch (e) {}
        }

        try {
            let sql = `
                SELECT p.*, 
                       json_agg(json_build_object(
                           'platform', pl.name,
                           'price', link.current_price,
                           'original_price', link.original_price,
                           'discount', link.discount_percent,
                           'url', link.product_url,
                           'affiliate_url', link.affiliate_url,
                           'in_stock', link.in_stock
                       )) as prices
                FROM products p
                LEFT JOIN product_links link ON link.product_id = p.id
                LEFT JOIN platforms pl ON pl.id = link.platform_id
            `;
            
            const sqlParams = [];
            const conditions = [];

            if (category) {
                conditions.push(`p.category = $${sqlParams.length + 1}`);
                sqlParams.push(category);
            }
            
            if (query) {
                conditions.push(`p.title ILIKE $${sqlParams.length + 1}`);
                sqlParams.push(`%${query}%`);
            }

            if (conditions.length > 0) {
                sql += ` WHERE ${conditions.join(' AND ')}`;
            }
            
            sql += ` GROUP BY p.id ORDER BY p.views_count DESC, p.last_updated DESC`;
            sql += ` LIMIT $${sqlParams.length + 1} OFFSET $${sqlParams.length + 2}`;
            sqlParams.push(limit, offset);
            
            const result = await pool.query(sql, sqlParams);
            const data = { products: result.rows, count: result.rows.length };

            if (redis && redis.isOpen && result.rows.length > 0) {
                await redis.setEx(cacheKey, 600, JSON.stringify(data));
            }

            return data;

        } catch (e) {
            console.error('DB Fetch Error:', e.message);
            return { products: [], count: 0, error: e.message };
        }
    },
    
    // ═══════════════════════════════════════════
    // AI FUNCTIONS
    // ═══════════════════════════════════════════
    
    getPendingAIProducts: async (limit = 50) => {
        try {
            const res = await pool.query(`
                SELECT id, title, category
                FROM products 
                WHERE ai_processed = false 
                ORDER BY created_at DESC
                LIMIT $1
            `, [limit]);
            return res.rows;
        } catch (e) {
            return [];
        }
    },
    
    bulkUpdateAI: async (updates) => {
        if (!updates || updates.length === 0) return 0;
        
        const client = await pool.connect();
        let updated = 0;
        
        try {
            await client.query('BEGIN');
            
            for (const u of updates) {
                await client.query(`
                    UPDATE products 
                    SET category = COALESCE($1, category),
                        subcategory = $2,
                        ai_tags = $3::text[],
                        specifications = specifications || $4::jsonb,
                        ai_processed = true
                    WHERE id = $5
                `, [
                    u.category,
                    u.subcategory || null,
                    u.tags || [],
                    JSON.stringify(u.specifications || {}),
                    u.id
                ]);
                updated++;
            }
            
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
        } finally {
            client.release();
        }
        
        return updated;
    },
    
    // ═══════════════════════════════════════════
    // STATISTICS
    // ═══════════════════════════════════════════
    
    getStats: async () => {
        try {
            const [products, links, verified, aiProcessed] = await Promise.all([
                pool.query('SELECT COUNT(*) FROM products'),
                pool.query('SELECT COUNT(*) FROM product_links'),
                pool.query('SELECT COUNT(*) FROM product_links WHERE is_verified = true'),
                pool.query('SELECT COUNT(*) FROM products WHERE ai_processed = true')
            ]);
            
            return {
                products: parseInt(products.rows[0].count) || 0,
                links: parseInt(links.rows[0].count) || 0,
                verified: parseInt(verified.rows[0].count) || 0,
                ai_processed: parseInt(aiProcessed.rows[0].count) || 0,
                platforms: CONFIG.getActivePlatforms()
            };
        } catch (e) {
            return { products: 0, links: 0, verified: 0, ai_processed: 0, platforms: [] };
        }
    },
    
    // ═══════════════════════════════════════════
    // DAILY LOGGING
    // ═══════════════════════════════════════════
    
    createDailyLog: async (date) => {
        try {
            const res = await pool.query(`
                INSERT INTO daily_logs (run_date, started_at, status)
                VALUES ($1, NOW(), 'running')
                ON CONFLICT (run_date) DO UPDATE SET started_at = NOW(), status = 'running'
                RETURNING id
            `, [date]);
            return res.rows[0].id;
        } catch (e) {
            return null;
        }
    },
    
    updateDailyLog: async (logId, data) => {
        try {
            await pool.query(`
                UPDATE daily_logs SET
                    completed_at = NOW(),
                    status = $1,
                    trending_detected = $2,
                    platforms_scraped = $3,
                    total_products_found = $4,
                    total_products_saved = $5,
                    total_products_updated = $6,
                    ai_processed = $7,
                    alerts_sent = $8,
                    errors = $9,
                    duration_seconds = $10,
                    github_committed = $11
                WHERE id = $12
            `, [
                data.status || 'completed',
                JSON.stringify(data.trending || []),
                JSON.stringify(data.platforms || {}),
                data.found || 0,
                data.saved || 0,
                data.updated || 0,
                data.aiProcessed || 0,
                data.alertsSent || 0,
                JSON.stringify(data.errors || []),
                data.duration || 0,
                data.githubCommitted || false,
                logId
            ]);
        } catch (e) {}
    },
    
    createScrapeSession: async (logId, platform, query) => {
        try {
            const res = await pool.query(`
                INSERT INTO scrape_sessions (daily_log_id, platform, query, started_at)
                VALUES ($1, $2, $3, NOW())
                RETURNING id
            `, [logId, platform, query]);
            return res.rows[0].id;
        } catch (e) {
            return null;
        }
    },
    
    updateScrapeSession: async (sessionId, data) => {
        try {
            await pool.query(`
                UPDATE scrape_sessions SET
                    products_found = $1,
                    products_saved = $2,
                    products_updated = $3,
                    completed_at = NOW(),
                    status = $4,
                    error_message = $5,
                    category = $6
                WHERE id = $7
            `, [
                data.found || 0,
                data.saved || 0,
                data.updated || 0,
                data.status || 'completed',
                data.error || null,
                data.category || null,
                sessionId
            ]);
        } catch (e) {}
    },
    
    // ═══════════════════════════════════════════
    // EXPORT FUNCTIONS (For GitHub Backup)
    // ═══════════════════════════════════════════
    
    getDailyLogData: async (date) => {
        try {
            const log = await pool.query(`SELECT * FROM daily_logs WHERE run_date = $1`, [date]);
            const sessions = await pool.query(`
                SELECT * FROM scrape_sessions WHERE daily_log_id = $1 ORDER BY started_at
            `, [log.rows[0]?.id]);
            
            return { log: log.rows[0] || null, sessions: sessions.rows || [] };
        } catch (e) {
            return { log: null, sessions: [] };
        }
    },
    
    getProductsForBackup: async (limit = 10000, offset = 0) => {
        try {
            const res = await pool.query(`
                SELECT 
                    p.id, p.fingerprint, p.title, p.brand, 
                    p.category, p.subcategory, p.specifications,
                    p.ai_tags, p.created_at,
                    json_agg(json_build_object(
                        'platform', pl.name,
                        'price', link.current_price,
                        'url', link.product_url
                    )) as prices
                FROM products p
                LEFT JOIN product_links link ON link.product_id = p.id
                LEFT JOIN platforms pl ON pl.id = link.platform_id
                GROUP BY p.id
                ORDER BY p.created_at DESC
                LIMIT $1 OFFSET $2
            `, [limit, offset]);
            return res.rows;
        } catch (e) {
            return [];
        }
    },
    
    getPriceHistoryForBackup: async (startDate, endDate) => {
        try {
            const res = await pool.query(`
                SELECT 
                    p.fingerprint,
                    pl.name as platform,
                    ph.price,
                    ph.recorded_at
                FROM price_history ph
                JOIN product_links link ON link.id = ph.link_id
                JOIN products p ON p.id = link.product_id
                JOIN platforms pl ON pl.id = link.platform_id
                WHERE ph.recorded_at BETWEEN $1 AND $2
                ORDER BY ph.recorded_at DESC
            `, [startDate, endDate]);
            return res.rows;
        } catch (e) {
            return [];
        }
    },
    
    // ═══════════════════════════════════════════
    // CLEANUP
    // ═══════════════════════════════════════════
    
    deleteOldData: async (monthsToKeep = 6) => {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            
            const cutoffDate = new Date();
            cutoffDate.setMonth(cutoffDate.getMonth() - monthsToKeep);
            
            const priceResult = await client.query(`
                DELETE FROM price_history WHERE recorded_at < $1 RETURNING id
            `, [cutoffDate]);
            
            const productResult = await client.query(`
                DELETE FROM products 
                WHERE id IN (
                    SELECT p.id FROM products p
                    LEFT JOIN product_links link ON link.product_id = p.id
                    WHERE p.created_at < $1
                    AND (link.last_scraped IS NULL OR link.last_scraped < $1)
                )
                RETURNING id
            `, [cutoffDate]);
            
            await client.query('COMMIT');
            
            return {
                priceHistoryDeleted: priceResult.rowCount,
                productsDeleted: productResult.rowCount
            };
        } catch (e) {
            await client.query('ROLLBACK');
            return { priceHistoryDeleted: 0, productsDeleted: 0 };
        } finally {
            client.release();
        }
    }
};

module.exports = { initDB, DB };