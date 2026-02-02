const rateLimit = require('express-rate-limit');

// ═══════════════════════════════════════════
// IP-BASED RATE LIMITER
// ═══════════════════════════════════════════

const ipLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per IP per 15 minutes
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: 'Too many requests, please try again later' }
});

module.exports = { ipLimiter };