const express = require('express');
const router = express.Router();
const { DB } = require('../core/db');
const Auth = require('../api/auth');
const Payments = require('../api/payments');
const CONFIG = require('../config');
const validation = require('../utils/validation');

// All routes require authentication
router.use(Auth.middleware);

// ═══════════════════════════════════════════
// USER PROFILE
// ═══════════════════════════════════════════

router.get('/profile', async (req, res) => {
    try {
        const subscription = await Payments.checkSubscription(req.user.id);
        
        res.json({
            id: req.user.id,
            email: req.user.email,
            displayName: req.user.display_name,
            photoUrl: req.user.photo_url,
            subscription,
            dailySearchesUsed: req.user.daily_search_count,
            dailySearchLimit: subscription.plan === 'free' 
                ? CONFIG.LIMITS.freeDailySearches 
                : CONFIG.PLANS[subscription.plan]?.searches || -1
        });
    } catch (e) {
        console.error(`[${req.id}] Profile error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// WISHLIST MANAGEMENT
// ═══════════════════════════════════════════

// Get Wishlist
router.get('/wishlist', async (req, res) => {
    try {
        const result = await DB.query(`
            SELECT 
                w.id, w.target_price, w.notify_on_any_drop, w.created_at,
                p.id as product_id, p.title, p.image_url, p.category,
                json_agg(json_build_object(
                    'platform', pl.name,
                    'price', link.current_price,
                    'url', link.product_url
                )) as prices
            FROM watchlists w
            JOIN products p ON p.id = w.product_id
            LEFT JOIN product_links link ON link.product_id = p.id
            LEFT JOIN platforms pl ON pl.id = link.platform_id
            WHERE w.user_id = $1
            GROUP BY w.id, p.id
            ORDER BY w.created_at DESC
        `, [req.user.id]);
        
        res.json({ items: result.rows });
    } catch (e) {
        console.error(`[${req.id}] Wishlist fetch error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// Add to Wishlist
router.post('/wishlist', async (req, res) => {
    try {
        // CRITICAL FIX #2: Validate input
        const productId = validation.validateUUID(req.body.productId, 'productId');
        const targetPrice = req.body.targetPrice ? validation.validateAmount(req.body.targetPrice, 'targetPrice') : null;
        const notifyOnAnyDrop = validation.validateBoolean(req.body.notifyOnAnyDrop);
        
        // Check limit
        const subscription = await Payments.checkSubscription(req.user.id);
        const limit = subscription.plan === 'free' 
            ? CONFIG.LIMITS.freeWishlistLimit 
            : CONFIG.PLANS[subscription.plan]?.wishlist || -1;
        
        if (limit !== -1) {
            const countResult = await DB.query(
                'SELECT COUNT(*) FROM watchlists WHERE user_id = $1',
                [req.user.id]
            );
            
            if (parseInt(countResult.rows[0].count) >= limit) {
                return res.status(403).json({ 
                    error: 'Wishlist limit reached',
                    limit,
                    upgrade: true
                });
            }
        }
        
        // Add item
        const result = await DB.query(`
            INSERT INTO watchlists (user_id, product_id, target_price, notify_on_any_drop)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, product_id) DO UPDATE SET
                target_price = EXCLUDED.target_price,
                notify_on_any_drop = EXCLUDED.notify_on_any_drop
            RETURNING id
        `, [req.user.id, productId, targetPrice, notifyOnAnyDrop || false]);
        
        // Increment product watch count
        await DB.query(
            'UPDATE products SET watch_count = watch_count + 1 WHERE id = $1',
            [productId]
        );
        
        res.json({ success: true, id: result.rows[0].id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Remove from Wishlist
router.delete('/wishlist/:productId', async (req, res) => {
    try {
        await DB.query(
            'DELETE FROM watchlists WHERE user_id = $1 AND product_id = $2',
            [req.user.id, req.params.productId]
        );
        
        // Decrement watch count
        await DB.query(
            'UPDATE products SET watch_count = GREATEST(0, watch_count - 1) WHERE id = $1',
            [req.params.productId]
        );
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// OFFLINE WISHLIST SYNC
// ═══════════════════════════════════════════

// Sync wishlist changes from offline (SQLite) to backend (PostgreSQL)
router.post('/wishlist/sync', async (req, res) => {
    try {
        const { actions } = req.body; // Array of {action, productId, targetPrice, notifyOnAnyDrop}
        
        if (!Array.isArray(actions) || actions.length === 0) {
            return res.status(400).json({ error: 'actions array required' });
        }
        
        const results = [];
        
        for (const item of actions) {
            try {
                if (item.action === 'add') {
                    // Add to wishlist
                    const productId = validation.validateUUID(item.productId, 'productId');
                    const targetPrice = item.targetPrice ? validation.validateAmount(item.targetPrice, 'targetPrice') : null;
                    const notifyOnAnyDrop = validation.validateBoolean(item.notifyOnAnyDrop);
                    
                    const result = await DB.query(`
                        INSERT INTO watchlists (user_id, product_id, target_price, notify_on_any_drop)
                        VALUES ($1, $2, $3, $4)
                        ON CONFLICT (user_id, product_id) DO UPDATE SET
                            target_price = EXCLUDED.target_price,
                            notify_on_any_drop = EXCLUDED.notify_on_any_drop
                        RETURNING id
                    `, [req.user.id, productId, targetPrice, notifyOnAnyDrop || false]);
                    
                    // Increment watch count
                    await DB.query('UPDATE products SET watch_count = watch_count + 1 WHERE id = $1', [productId]);
                    
                    results.push({ productId, success: true, action: 'add' });
                } else if (item.action === 'remove') {
                    // Remove from wishlist
                    const productId = validation.validateUUID(item.productId, 'productId');
                    
                    await DB.query(
                        'DELETE FROM watchlists WHERE user_id = $1 AND product_id = $2',
                        [req.user.id, productId]
                    );
                    
                    // Decrement watch count
                    await DB.query(
                        'UPDATE products SET watch_count = GREATEST(0, watch_count - 1) WHERE id = $1',
                        [productId]
                    );
                    
                    results.push({ productId, success: true, action: 'remove' });
                }
            } catch (e) {
                results.push({ productId: item.productId, success: false, error: e.message, action: item.action });
            }
        }
        
        res.json({ synced: results, timestamp: new Date().toISOString() });
    } catch (e) {
        console.error(`[${req.id}] Sync error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// SEARCH QUOTA & BONUSES
// ═══════════════════════════════════════════

router.get('/quota', async (req, res) => {
    try {
        const subscription = await Payments.checkSubscription(req.user.id);
        const limit = subscription.plan === 'free' 
            ? CONFIG.LIMITS.freeDailySearches 
            : CONFIG.PLANS[subscription.plan]?.searches || -1;
        
        res.json({
            used: req.user.daily_search_count,
            limit,
            unlimited: limit === -1,
            remaining: limit === -1 ? -1 : Math.max(0, limit - req.user.daily_search_count)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Add bonus searches (e.g. after watching Reward Ad)
router.post('/quota/bonus', async (req, res) => {
    try {
        const bonus = CONFIG.LIMITS.rewardAdBonus;
        
        await DB.query(`
            UPDATE users 
            SET daily_search_count = GREATEST(0, daily_search_count - $1)
            WHERE id = $2
        `, [bonus, req.user.id]);
        
        res.json({ success: true, bonus });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════

router.post('/fcm-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        await DB.query(
            'UPDATE users SET fcm_token = $1 WHERE id = $2',
            [token, req.user.id]
        );
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// PAYMENTS
// ═══════════════════════════════════════════

router.get('/plans', async (req, res) => {
    try {
        const plans = await Payments.getPlans();
        res.json({ plans });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/subscribe', async (req, res) => {
    try {
        const { planName } = req.body;
        const order = await Payments.createOrder(req.user.id, planName);
        res.json(order);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/verify-payment', async (req, res) => {
    try {
        const { orderId, paymentId, signature } = req.body;
        const result = await Payments.verifyPayment(orderId, paymentId, signature);
        res.json(result);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

module.exports = router;