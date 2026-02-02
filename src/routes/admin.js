const express = require('express');
const router = express.Router();
const { DB } = require('../core/db');
const Auth = require('../api/auth');

// All routes require admin auth
router.use(Auth.adminMiddleware);

// ═══════════════════════════════════════════
// DASHBOARD STATS
// ═══════════════════════════════════════════

router.get('/stats', async (req, res) => {
    try {
        const [users, products, subscriptions, revenue] = await Promise.all([
            DB.query('SELECT COUNT(*) FROM users'),
            DB.query('SELECT COUNT(*) FROM products'),
            DB.query(`SELECT subscription_plan, COUNT(*) FROM users GROUP BY subscription_plan`),
            DB.query(`SELECT SUM(amount) as total FROM payments WHERE status = 'completed' AND created_at > NOW() - INTERVAL '30 days'`)
        ]);
        
        res.json({
            totalUsers: parseInt(users.rows[0].count),
            totalProducts: parseInt(products.rows[0].count),
            subscriptions: subscriptions.rows,
            monthlyRevenue: parseInt(revenue.rows[0]?.total || 0)
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════

router.get('/users', async (req, res) => {
    try {
        const { limit = 50, offset = 0, search } = req.query;
        let query = `SELECT id, email, display_name, subscription_plan, is_blocked, created_at FROM users`;
        const params = [];
        
        if (search) {
            query += ` WHERE email ILIKE $1`;
            params.push(`%${search}%`);
        }
        
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        
        const result = await DB.query(query, params);
        res.json({ users: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/users/:id/block', async (req, res) => {
    try {
        await DB.query(`UPDATE users SET is_blocked = true, block_reason = $1 WHERE id = $2`, [req.body.reason, req.params.id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// DAILY LOGS
// ═══════════════════════════════════════════

router.get('/logs', async (req, res) => {
    try {
        const { limit = 30 } = req.query;
        const result = await DB.query(`SELECT * FROM daily_logs ORDER BY run_date DESC LIMIT $1`, [limit]);
        res.json({ logs: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ═══════════════════════════════════════════
// APP CONFIG
// ═══════════════════════════════════════════

router.get('/config', async (req, res) => {
    try {
        const result = await DB.query('SELECT * FROM app_config ORDER BY key');
        res.json({ config: result.rows });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;