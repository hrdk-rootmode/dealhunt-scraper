const cheerio = require('cheerio');

class FlipkartPlugin {
    constructor(selectors, httpClient) {
        this.selectors = selectors;
        this.client = httpClient;
        this.baseUrl = 'https://www.flipkart.com';
    }
    
    getSel(field, healed = null) {
        const base = this.selectors?.patterns?.[field]?.selectors || [];
        return healed ? [healed, ...base] : base;
    }
    
    extractText($, element, field, healedSel = null) {
        const selectors = this.getSel(field, healedSel);
        for (const sel of selectors) {
            try {
                const text = $(element).find(sel).first().text().trim();
                if (text && text.length > 0) return text;
            } catch (e) {}
        }
        return null;
    }
    
    extractAttr($, element, field, attr, healedSel = null) {
        const selectors = this.getSel(field, healedSel);
        for (const sel of selectors) {
            try {
                const value = $(element).find(sel).first().attr(attr);
                if (value) return value;
            } catch (e) {}
        }
        return null;
    }
    
    async scrape(query, limit = 20) {
        // 🔥 Reset healing for each category
        const healedSelectors = {};
        let healingAttempted = false;
        
        const products = [];
        let page = 1;
        
        while (products.length < limit && page <= 5) {
            const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&page=${page}`;
            
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
                    
                    // Try extraction with healed selectors
                    const product = this.extractProduct($, element, healedSelectors, query);
                    
                    if (product) {
                        products.push(product);
                        extractedThisPage++;
                        failedCount = 0;
                    } else {
                        failedCount++;
                    }
                    
                    // 🔥 Trigger healing after 3 failures (once per category)
                    if (failedCount >= 3 && !healingAttempted) {
                        console.log(`   ⚠️ 3 failures. Triggering AI Healing...`);
                        healingAttempted = true;
                        
                        // Heal and store
                        const titleSel = await this.healField($, element, 'title');
                        const priceSel = await this.healField($, element, 'price');
                        
                        if (titleSel) healedSelectors['title'] = titleSel;
                        if (priceSel) healedSelectors['price'] = priceSel;
                        
                        // Retry remaining cards with new selectors
                        for (let j = i; j < cards.length && products.length < limit; j++) {
                            const retryProduct = this.extractProduct($, cards[j], healedSelectors, query);
                            if (retryProduct) {
                                products.push(retryProduct);
                                extractedThisPage++;
                            }
                        }
                        break;
                    }
                }
                
                console.log(`📄 Flipkart Page ${page}: ${cards.length} cards, ${extractedThisPage} extracted`);
                page++;
                
                // 🔥 Increased delay to avoid 429 errors
                await new Promise(r => setTimeout(r, 3000));
                
            } catch (e) {
                if (e.response?.status === 429) {
                    console.log(`   ⚠️ Rate limited. Waiting 10 seconds...`);
                    await new Promise(r => setTimeout(r, 10000));
                    continue; // Retry same page
                }
                console.error(`   ❌ Page ${page} Error:`, e.message);
                break;
            }
        }
        
        return products;
    }
    
    extractProduct($, element, healedSelectors = {}, query = '') {
        // Get Product ID
        let productId = $(element).attr('data-id');
        
        if (!productId) {
            const linkHref = this.extractAttr($, element, 'link', 'href', healedSelectors['link']);
            if (linkHref) {
                if (linkHref.includes('pid=')) {
                    productId = linkHref.split('pid=')[1].split('&')[0];
                } else {
                    // Generate unique ID from link
                    productId = 'fk_' + Buffer.from(linkHref).toString('base64').substring(0, 20);
                }
            }
        }
        
        if (!productId) return null;
        
        // Extract with healed selectors
        const title = this.extractText($, element, 'title', healedSelectors['title']);
        const priceText = this.extractText($, element, 'price', healedSelectors['price']);
        
        if (!title || !priceText) return null;
        if (title.length < 5) return null;
        
        const mrpText = this.extractText($, element, 'mrp', healedSelectors['mrp']);
        const ratingText = this.extractText($, element, 'rating', healedSelectors['rating']);
        const reviewsText = this.extractText($, element, 'reviews', healedSelectors['reviews']);
        const imageUrl = this.extractAttr($, element, 'image', 'src', healedSelectors['image']);
        const linkHref = this.extractAttr($, element, 'link', 'href', healedSelectors['link']);
        
        // Parse numbers
        const currentPrice = parseFloat(priceText.replace(/[^0-9.]/g, ''));
        if (isNaN(currentPrice) || currentPrice <= 0) return null;
        
        const originalPrice = mrpText 
            ? parseFloat(mrpText.replace(/[^0-9.]/g, '')) 
            : currentPrice;
        
        const rating = ratingText 
            ? parseFloat(ratingText.replace(/[^0-9.]/g, '')) 
            : 0;
        
        const reviewCount = reviewsText 
            ? parseInt(reviewsText.replace(/[^0-9]/g, '')) 
            : 0;
        
        const discountPercent = originalPrice > currentPrice 
            ? Math.round(((originalPrice - currentPrice) / originalPrice) * 100)
            : 0;
        
        const productUrl = linkHref 
            ? (linkHref.startsWith('http') ? linkHref : `${this.baseUrl}${linkHref}`)
            : `${this.baseUrl}/search?q=${query}`;
        
        return {
            product_id: productId,
            title: title.replace(/\s+/g, ' ').trim(),
            brand: title.split(' ')[0],
            current_price: currentPrice,
            original_price: originalPrice || currentPrice,
            discount_percent: discountPercent,
            rating: rating || 0,
            review_count: reviewCount || 0,
            image_url: imageUrl,
            product_url: productUrl,
            is_available: true,
            specifications: {}
        };
    }
    
    async healField($, element, fieldName) {
        console.log(`   🚑 Healing '${fieldName}'...`);
        
        const AI = require('../core/ai');
        const htmlSnippet = $(element).html();
        
        if (!htmlSnippet || htmlSnippet.length < 50) return null;
        
        try {
            const newSelector = await AI.healSelector('flipkart', fieldName, htmlSnippet);
            
            if (newSelector) {
                console.log(`   ✅ Healed '${fieldName}': ${newSelector}`);
                return newSelector;
            }
        } catch (e) {
            console.error(`   ❌ Healing failed:`, e.message);
        }
        
        return null;
    }
}

module.exports = FlipkartPlugin;