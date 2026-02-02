const express = require('express');
const router = express.Router();
const { DB } = require('../core/db');
const Affiliate = require('../api/affiliate');
const Auth = require('../api/auth');
const searchQuotaMiddleware = require('../middleware/quota');
const validation = require('../utils/validation');

// ═══════════════════════════════════════════
// PRODUCT SEARCH (Public + Optional Auth for Quota)
// ═══════════════════════════════════════════

router.get('/products', 
    Auth.optionalMiddleware, // Check user if token exists
    searchQuotaMiddleware,   // Apply quota if user exists
    async (req, res) => {
        try {
            // CRITICAL FIX #2: Input Validation
            if (!req.query.query) {
                return res.status(400).json({ error: 'query parameter is required' });
            }
            
            const query = validation.validateString(req.query.query, 'query', 2, 500);
            const category = req.query.category ? validation.validateString(req.query.category, 'category', 1, 100) : null;
            const { limit, offset } = validation.validatePagination(req.query.limit, req.query.offset);
            
            const data = await DB.getProductsCached({
                category,
                query,
                limit,
                offset
            });
            
            // Inject affiliate links
            data.products = Affiliate.processProductList(data.products);
            
            res.json(data);
        } catch (e) {
            console.error(`[${req.id}] Products search error:`, e.message);
            res.status(400).json({ error: e.message });
        }
    }
);

// ═══════════════════════════════════════════// TRENDING DATA (From Redis Cache)
// ═══════════════════════════════════════════

router.get('/trending', async (req, res) => {
    try {
        const data = await DB.getTrendingData();
        res.json(data);
    } catch (e) {
        console.error(`[${req.id}] Trending fetch error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// SIMILAR PRODUCTS (Based on Average Views)
// ═══════════════════════════════════════════

router.get('/similar/:id', async (req, res) => {
    try {
        const productId = validation.validateUUID(req.params.id, 'product id');
        const limit = req.query.limit ? validation.validateNumber(req.query.limit, 'limit', 1, 20) : 5;
        
        const products = await DB.getSimilarProducts(productId, limit);
        res.json({ products });
    } catch (e) {
        console.error(`[${req.id}] Similar products error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════// SINGLE PRODUCT DETAILS
// ═══════════════════════════════════════════

router.get('/product/:id', async (req, res) => {
    try {
        // CRITICAL FIX #2: Validate UUID
        const productId = validation.validateUUID(req.params.id, 'product id');
        
        const productRes = await DB.query(`
            SELECT p.*, 
                   json_agg(json_build_object(
                       'platform', pl.name,
                       'price', link.current_price,
                       'original_price', link.original_price,
                       'discount', link.discount_percent,
                       'rating', link.rating,
                       'reviews', link.review_count,
                       'url', link.product_url,
                       'in_stock', link.in_stock,
                       'last_scraped', link.last_scraped
                   )) as prices
            FROM products p
            LEFT JOIN product_links link ON link.product_id = p.id
            LEFT JOIN platforms pl ON pl.id = link.platform_id
            WHERE p.id = $1
            GROUP BY p.id
        `, [productId]);
        
        if (productRes.rows.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }
        
        const product = productRes.rows[0];
        
        // Inject affiliate links
        if (product.prices) {
            product.prices = product.prices.map(p => ({
                ...p,
                affiliate_url: Affiliate.inject(p.platform, p.url)
            }));
        }
        
        // Increment view count
        await DB.query('UPDATE products SET views_count = views_count + 1 WHERE id = $1', [req.params.id]);
        
        // Get Price History
        const historyRes = await DB.query(`
            SELECT 
                pl.name as platform,
                ph.price,
                ph.recorded_at
            FROM price_history ph
            JOIN product_links link ON link.id = ph.link_id
            JOIN platforms pl ON pl.id = link.platform_id
            WHERE link.product_id = $1
            AND ph.recorded_at > NOW() - INTERVAL '30 days'
            ORDER BY ph.recorded_at ASC
        `, [req.params.id]);
        
        res.json({
            ...product,
            priceHistory: historyRes.rows
        });
        
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;