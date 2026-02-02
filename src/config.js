require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load platforms configuration
const platformsPath = path.join(__dirname, 'platforms.json');
const PLATFORMS_CONFIG = JSON.parse(fs.readFileSync(platformsPath, 'utf8'));

module.exports = {
    // ═══════════════════════════════════════════
    // SYSTEM
    // ═══════════════════════════════════════════
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    TZ: 'Asia/Kolkata',
    
    // ═══════════════════════════════════════════
    // DATABASE & CACHE
    // ═══════════════════════════════════════════
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    
    // ═══════════════════════════════════════════
    // AI
    // ═══════════════════════════════════════════
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    
    // ═══════════════════════════════════════════
    // FIREBASE
    // ═══════════════════════════════════════════
    FIREBASE: {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    },
    
    // ═══════════════════════════════════════════
    // RAZORPAY
    // ═══════════════════════════════════════════
    RAZORPAY: {
        keyId: process.env.RAZORPAY_KEY_ID,
        keySecret: process.env.RAZORPAY_KEY_SECRET,
        webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
    },
    
    // ═══════════════════════════════════════════
    // AFFILIATE LINKS
    // ═══════════════════════════════════════════
    AFFILIATE: {
        amazon: process.env.AFFILIATE_AMAZON_TAG || 'dealhunt-21',
        flipkart: process.env.AFFILIATE_FLIPKART_ID || '',
        croma: process.env.AFFILIATE_CROMA_ID || '',
        myntra: process.env.AFFILIATE_MYNTRA_ID || ''
    },
    
    // ═══════════════════════════════════════════
    // ADMOB (Sent to Frontend)
    // ═══════════════════════════════════════════
    ADMOB: {
        appId: process.env.ADMOB_APP_ID,
        bannerId: process.env.ADMOB_BANNER_ID,
        interstitialId: process.env.ADMOB_INTERSTITIAL_ID,
        rewardedId: process.env.ADMOB_REWARDED_ID
    },
    
    // ═══════════════════════════════════════════
    // SUBSCRIPTION PLANS (Defaults)
    // ═══════════════════════════════════════════
    PLANS: {
        free: {
            searches: parseInt(process.env.PLAN_FREE_SEARCHES) || 10,
            wishlist: parseInt(process.env.PLAN_FREE_WISHLIST) || 5
        },
        pro: {
            price: parseInt(process.env.PLAN_PRO_PRICE) || 4900,
            duration: parseInt(process.env.PLAN_PRO_DURATION_DAYS) || 30,
            searches: parseInt(process.env.PLAN_PRO_SEARCHES) || 100,
            wishlist: parseInt(process.env.PLAN_PRO_WISHLIST) || 50
        },
        premium: {
            price: parseInt(process.env.PLAN_PREMIUM_PRICE) || 14900,
            duration: parseInt(process.env.PLAN_PREMIUM_DURATION_DAYS) || 30,
            searches: -1,
            wishlist: -1
        }
    },
    
    // ═══════════════════════════════════════════
    // USER LIMITS
    // ═══════════════════════════════════════════
    LIMITS: {
        freeDailySearches: parseInt(process.env.FREE_DAILY_SEARCHES) || 10,
        freeWishlistLimit: parseInt(process.env.FREE_WISHLIST_LIMIT) || 5,
        rewardAdBonus: parseInt(process.env.REWARD_AD_BONUS_SEARCHES) || 5
    },
    
    // ═══════════════════════════════════════════
    // SECURITY
    // ═══════════════════════════════════════════
    CRON_SECRET: process.env.CRON_SECRET,
    ADMIN_SECRET: process.env.ADMIN_SECRET,
    JWT_SECRET: process.env.JWT_SECRET || 'default-jwt-secret-change-me',
    
    // ═══════════════════════════════════════════
    // DATA
    // ═══════════════════════════════════════════
    DATA_RETENTION_MONTHS: parseInt(process.env.DATA_RETENTION_MONTHS) || 6,
    
    // ═══════════════════════════════════════════
    // SCRAPING
    // ═══════════════════════════════════════════
    USE_BROWSER: process.env.USE_BROWSER === 'true',
    SCRAPE_DELAY: parseInt(process.env.SCRAPE_DELAY) || 2000,
    MAX_RETRIES: 3,
    TIMEOUT: 15000,
    
    // ═══════════════════════════════════════════
    // PLATFORMS
    // ═══════════════════════════════════════════
    PLATFORMS: PLATFORMS_CONFIG,
    
    getActivePlatforms: () => {
        return Object.keys(PLATFORMS_CONFIG).filter(p => PLATFORMS_CONFIG[p].isActive);
    },
    
    getSelectors: (platformName) => {
        return PLATFORMS_CONFIG[platformName]?.selectors || null;
    }
};