const CONFIG = require('../config');

const Affiliate = {
    // ═══════════════════════════════════════════
    // INJECT AFFILIATE TAG INTO URL
    // ═══════════════════════════════════════════
    
    inject: (platform, url) => {
        return CONFIG.generateAffiliateUrl(platform, url);
    },
    
    // ═══════════════════════════════════════════
    // PROCESS PRODUCT LIST
    // ═══════════════════════════════════════════
    
    processProductList: (products) => {
        if (!products || !Array.isArray(products)) return [];
        
        return products.map(p => ({
            ...p,
            prices: p.prices ? p.prices.map(price => ({
                ...price,
                affiliate_url: CONFIG.generateAffiliateUrl(price.platform, price.url)
            })) : []
        }));
    }
};

module.exports = Affiliate;