const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { DB } = require('./db');
const AI = require('./ai');
const CONFIG = require('../config');

// === PLUGIN LOADER ===
const plugins = {};
const platformsDir = path.join(__dirname, '../platforms');

if (fs.existsSync(platformsDir)) {
    fs.readdirSync(platformsDir).forEach(file => {
        if (file.endsWith('.js')) {
            const name = file.replace('.js', '').toLowerCase();
            plugins[name] = require(path.join(platformsDir, file));
            console.log(`🔌 Loaded Platform Plugin: ${name}`);
        }
    });
}

// === HTTP CLIENT ===
const httpClient = axios.create({
    timeout: CONFIG.TIMEOUT,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml'
    }
});

const Scraper = {
    getAvailable: () => Object.keys(plugins),
    
    // === ⚡ OPTIMIZED RUN ===
    run: async (platformName, query = 'smartphones', limit = 20) => {
        const pName = platformName.toLowerCase();
        
        if (!plugins[pName]) throw new Error(`Platform ${pName} not found`);
        
        const platformConfig = CONFIG.PLATFORMS[pName];
        if (!platformConfig || !platformConfig.isActive) {
            return { skipped: true, saved: 0 };
        }
        
        const selectors = await DB.getPlatformSelectors(pName);
        
        console.log(`🚀 Scraping ${pName} [${query}]...`);
        
        const Plugin = plugins[pName];
        const engine = new Plugin(selectors, httpClient);
        
        let products = [];
        
        try {
            products = await engine.scrape(query, limit);
        } catch (e) {
            console.error(`❌ Scrape Error:`, e.message);
            return { skipped: false, saved: 0, error: e.message };
        }
        
        if (products.length === 0) {
            return { skipped: false, saved: 0 };
        }
        
        // Inject category
        products = products.map(p => ({
            ...p,
            category: p.category || query.toLowerCase().replace(/\s+/g, '-')
        }));
        
        // ⚡ BULK SAVE (Much faster than one-by-one)
        const result = await DB.bulkUpsertProducts(products, pName);
        
        console.log(`   ✅ Saved: ${result.saved}/${products.length}`);
        
        if (result.duplicates > 0) {
            console.log(`   📝 Duplicates: ${result.duplicates}`);
        }
        

        return { 
            platform: pName, 
            found: products.length, 
            saved: result.saved,
            failed: result.failed
        };
    },
    
    // === RUN ALL PLATFORMS ===
    runAll: async (query = 'smartphones', limitPerPlatform = 20) => {
        const active = CONFIG.getActivePlatforms();
        const results = {};
        
        for (const platform of active) {
            try {
                results[platform] = await Scraper.run(platform, query, limitPerPlatform);
                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                results[platform] = { error: e.message };
            }
        }
        
        return results;
    }
};

module.exports = Scraper;