const { DB } = require('../core/db');
const CONFIG = require('../config');

// ═══════════════════════════════════════════
// USER SEARCH QUOTA MIDDLEWARE
// ═══════════════════════════════════════════
// CRITICAL FIX #5: Make quota check atomic to prevent race conditions

const searchQuotaMiddleware = async (req, res, next) => {
    // Skip quota check if user not logged in
    if (!req.firebaseUser) return next();
    
    const userId = req.firebaseUser.uid;
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // ATOMIC UPDATE: Database handles increment and reset in single transaction
        // This prevents race conditions from concurrent requests
        const result = await DB.query(`
            UPDATE users 
            SET 
                daily_search_count = CASE
                    WHEN last_search_reset::date < $1::date THEN 1
                    ELSE daily_search_count + 1
                END,
                last_search_reset = CASE
                    WHEN last_search_reset::date < $1::date THEN $1
                    ELSE last_search_reset
                END
            WHERE firebase_id = $2
            RETURNING daily_search_count, subscription_plan
        `, [today, userId]);
        
        if (result.rows.length === 0) {
            console.warn(`[${req.id}] User not found for quota check:`, userId);
            return next(); // User doesn't exist, allow request
        }
        
        const user = result.rows[0];
        const plan = user.subscription_plan || 'free';
        
        // Get limit based on subscription plan
        const limit = plan === 'free' 
            ? CONFIG.LIMITS?.freeDailySearches || 20
            : CONFIG.PLANS?.[plan]?.searches || -1; // -1 = unlimited
        
        // Check if limit exceeded
        if (limit !== -1 && user.daily_search_count > limit) {
            console.log(`[${req.id}] Quota exceeded for user ${userId}: ${user.daily_search_count}/${limit}`);
            return res.status(429).json({
                error: 'Daily search limit reached',
                limit,
                used: user.daily_search_count - 1, // Show what user actually used
                reset: today,
                upgrade: true // Signal frontend to show upgrade dialog
            });
        }
        
        // Attach quota info to request for logging
        req.quota = {
            used: user.daily_search_count,
            limit: limit === -1 ? 'unlimited' : limit,
            remaining: limit === -1 ? -1 : limit - user.daily_search_count
        };
        
        next();
        
    } catch (e) {
        console.error(`[${req.id}] Quota check error:`, e.message);
        // Fail open: allow request if DB fails to avoid blocking users
        // Better to lose quota accuracy than deny legitimate requests
        next();
    }
};

module.exports = searchQuotaMiddleware;
