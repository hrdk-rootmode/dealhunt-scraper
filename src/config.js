require('dotenv').config();
const fs = require('fs');
const path = require('path');

// Load platforms configuration
const platformsPath = path.join(__dirname, 'platforms.json');
const PLATFORMS_CONFIG = JSON.parse(fs.readFileSync(platformsPath, 'utf8'));

module.exports = {
    // === SYSTEM ===
    PORT: process.env.PORT || 3000,
    ENV: process.env.NODE_ENV || 'development',
    TZ: 'Asia/Kolkata',
    
    // === KEYS ===
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    
    // === SCRAPING MODE ===
    USE_BROWSER: process.env.USE_BROWSER === 'true', // Enable Puppeteer for local seeding
    
    // === LIMITS ===
    SCRAPE_DELAY: parseInt(process.env.SCRAPE_DELAY) || 2000, // 2s between requests
    MAX_RETRIES: 3,
    TIMEOUT: 15000,
    
    // === PLATFORMS (Loaded from JSON) ===
    PLATFORMS: PLATFORMS_CONFIG,
    
    // Helper: Get active platforms
    getActivePlatforms: () => {
        return Object.keys(PLATFORMS_CONFIG).filter(p => PLATFORMS_CONFIG[p].isActive);
    },
    
    // Helper: Check if platform supports category
    canScrapeCategory: (platformName, category) => {
        const platform = PLATFORMS_CONFIG[platformName];
        if (!platform) return false;
        if (platform.categories.includes('all')) return true;
        return platform.categories.includes(category);
    },
    
    // Helper: Get selectors for platform
    getSelectors: (platformName) => {
        return PLATFORMS_CONFIG[platformName]?.selectors || null;
    }
};