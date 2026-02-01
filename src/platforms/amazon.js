const cheerio = require('cheerio');

class AmazonPlugin {
    constructor(selectors, httpClient) {
        this.selectors = selectors;
        this.client = httpClient;
        this.baseUrl = 'https://www.amazon.in';
        this.healingDone = {};
        this.healedSelectors = {};
    }
    
    getSel(field) {
        if (this.healedSelectors[field]) {
            return [this.healedSelectors[field], ...this.selectors?.patterns?.[field]?.selectors || []];
        }
        return this.selectors?.patterns?.[field]?.selectors || [];
    }
    
    extractText($, element, field) {
        const selectors = this.getSel(field);
        for (const sel of selectors) {
            try {
                const text = $(element).find(sel).first().text().trim();
                if (text && text.length > 0) return text;
            } catch (e) {}
        }
        return null;
    }
    
    extractAttr($, element, field, attr) {
        const selectors = this.getSel(field);
        for (const sel of selectors) {
            try {
                const value = $(element).find(sel).first().attr(attr);
                if (value) return value;
            } catch (e) {}
        }
        return null;
    }
    
    async scrape(query, limit = 20) {
        const products = [];
        let page = 1;
        let hasHealed = false;
        
        while (products.length < limit && page <= 5) {
            const url = `${this.baseUrl}/s?k=${encodeURIComponent(query)}&page=${page}`;
            
            try {
                const { data } = await this.client.get(url);
                const $ = cheerio.load(data);
                
                const cards = $(this.getSel('product_card').join(', '));
                
                if (cards.length === 0) {
                    console.log(`   ⚠️ No cards on page ${page}`);
                    break;
                }
                
                let extractedThisPage = 0;
                let failedCount = 0;
                
                for (let i = 0; i < cards.length && products.length < limit; i++) {
                    const element = cards[i];
                    const product = this.extractProduct($, element);
                    
                    if (product) {
                        products.push(product);
                        extractedThisPage++;
                        failedCount = 0;
                    } else {
                        failedCount++;
                    }
                    
                    // Trigger healing after 5 consecutive failures
                    if (failedCount >= 5 && !hasHealed) {
                        console.log(`   ⚠️ 5 failures detected. Triggering AI Healing...`);
                        hasHealed = true;
                        
                        await this.healField($, element, 'title', 'Find CSS selector for product title');
                        await this.healField($, element, 'price', 'Find CSS selector for product price');
                        
                        // Retry remaining cards
                        for (let j = i; j < cards.length && products.length < limit; j++) {
                            const retryProduct = this.extractProduct($, cards[j]);
                            if (retryProduct) {
                                products.push(retryProduct);
                                extractedThisPage++;
                            }
                        }
                        break;
                    }
                }
                
                console.log(`📄 Amazon Page ${page}: ${cards.length} cards, ${extractedThisPage} extracted`);
                page++;
                
                await new Promise(r => setTimeout(r, 1500));
                
            } catch (e) {
                console.error(`   ❌ Page ${page} Error:`, e.message);
                break;
            }
        }
        
        return products;
    }
    
    extractProduct($, element) {
        const asin = $(element).attr('data-asin');
        if (!asin || asin.length < 5) return null;
        
        const title = this.extractText($, element, 'title');
        const priceText = this.extractText($, element, 'price');
        
        if (!title || !priceText) return null;
        if (title.length < 10) return null;
        
        const mrpText = this.extractText($, element, 'mrp');
        const ratingText = this.extractText($, element, 'rating');
        const reviewsText = this.extractText($, element, 'reviews');
        const imageUrl = this.extractAttr($, element, 'image', 'src');
        
        const currentPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
        if (isNaN(currentPrice) || currentPrice <= 0) return null;
        
        const originalPrice = mrpText 
            ? parseFloat(mrpText.replace(/[^0-9.]/g, '')) 
            : currentPrice;
        
        const rating = ratingText 
            ? parseFloat(ratingText.split(' ')[0]) 
            : 0;
        
        const reviewCount = reviewsText 
            ? parseInt(reviewsText.replace(/[^0-9]/g, '')) 
            : 0;
        
        const discountPercent = originalPrice > currentPrice 
            ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
            : 0;
        
        return {
            product_id: asin,
            title: title.replace(/\s+/g, ' ').trim(),
            brand: title.split(' ')[0],
            current_price: currentPrice,
            original_price: originalPrice || currentPrice,
            discount_percent: discountPercent,
            rating: rating || 0,
            review_count: reviewCount || 0,
            image_url: imageUrl,
            product_url: `${this.baseUrl}/dp/${asin}`,
            is_available: true,
            specifications: {}
        };
    }
    
    async healField($, element, fieldName, hint) {
        if (this.healingDone[fieldName]) return null;
        this.healingDone[fieldName] = true;
        
        console.log(`   🚑 Healing '${fieldName}'...`);
        
        const AI = require('../core/ai');
        const htmlSnippet = $(element).html();
        
        if (!htmlSnippet || htmlSnippet.length < 50) return null;
        
        try {
            const newSelector = await AI.healSelector('amazon', fieldName, htmlSnippet, hint);
            
            if (newSelector) {
                this.healedSelectors[fieldName] = newSelector;
                
                if (!this.selectors.patterns[fieldName]) {
                    this.selectors.patterns[fieldName] = { selectors: [] };
                }
                this.selectors.patterns[fieldName].selectors.unshift(newSelector);
                
                console.log(`   ✅ Healed '${fieldName}': ${newSelector}`);
                return newSelector;
            }
        } catch (e) {
            console.error(`   ❌ Healing failed:`, e.message);
        }
        
        return null;
    }
}

module.exports = AmazonPlugin;