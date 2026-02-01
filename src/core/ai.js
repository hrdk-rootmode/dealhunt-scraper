const axios = require('axios');
const CONFIG = require('../config');
const { DB } = require('./db');

const AI = {
    // === SMART SELECTOR HEALING ===
    healSelector: async (platformName, field, htmlSnippet, hint = '') => {
        if (!CONFIG.GROQ_API_KEY) {
            console.warn('   ⚠️ Groq API Key missing');
            return null;
        }
        
        // Create a focused prompt based on the field
        let fieldHint = hint;
        if (!fieldHint) {
            const hints = {
                'title': 'product name/title text',
                'price': 'current selling price (with currency symbol like ₹)',
                'mrp': 'original/strike-through price (MRP)',
                'rating': 'star rating (like 4.5)',
                'reviews': 'number of reviews/ratings',
                'image': 'product image',
                'link': 'product detail page link',
                'product_card': 'container div that holds one product'
            };
            fieldHint = hints[field] || field;
        }
        
        const prompt = `You are analyzing an e-commerce SEARCH RESULTS page HTML.

TASK: Find a CSS selector that extracts "${fieldHint}" from product cards.

RULES:
1. Return ONLY class-based selectors (like .className or div.className)
2. Do NOT use IDs (#productTitle is WRONG - that's for detail pages)
3. Do NOT use dynamic attributes like [data-cel-widget] or [cel_widget_id]
4. The selector must work for MULTIPLE products on the page
5. Keep it simple and reusable

HTML SNIPPET (one product card):
${htmlSnippet.substring(0, 2500)}

Return ONLY this JSON format:
{"selector": ".your-selector-here"}`;
        
        try {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                },
                { 
                    headers: { 
                        'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 20000
                }
            );
            
            const result = JSON.parse(response.data.choices[0].message.content);
            
            if (result.selector) {
                // Validate: Reject bad patterns
                const badPatterns = [
                    '#productTitle', '#title', '#price',
                    '[cel_widget_id', '[data-cel-widget',
                    'MAIN-SEARCH', 'MAIN-', ':nth-child'
                ];
                
                const isBad = badPatterns.some(p => result.selector.includes(p));
                
                if (isBad) {
                    console.log(`   ⚠️ AI returned invalid selector: ${result.selector}`);
                    return null;
                }
                
                // Save to database for persistence
                try {
                    await DB.query(`
                        UPDATE platforms 
                        SET selectors = jsonb_set(
                            COALESCE(selectors, '{}'::jsonb),
                            '{patterns,${field},selectors}',
                            (
                                COALESCE(selectors->'patterns'->'${field}'->'selectors', '[]'::jsonb) || $1::jsonb
                            )
                        ),
                        updated_at = NOW()
                        WHERE name = $2
                    `, [JSON.stringify([result.selector]), platformName]);
                } catch (dbErr) {
                    // Fallback simpler update
                    console.log(`   ⚠️ DB update fallback`);
                }
                
                return result.selector;
            }
            
        } catch (e) {
            console.error(`   ❌ AI Error:`, e.message);
        }
        
        return null;
    },
    
    // === BATCH CATEGORIZATION ===
    processQueue: async (limit = 100) => {
        if (!CONFIG.GROQ_API_KEY) {
            console.warn('   ⚠️ Groq API Key missing');
            return 0;
        }
        
        const products = await DB.getPendingAIProducts(limit);
        
        if (products.length === 0) {
            console.log('   ✅ No pending AI products');
            return 0;
        }
        
        console.log(`   🤖 Processing ${products.length} products...`);
        
        const batchSize = 10;
        let totalProcessed = 0;
        
        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);
            const processed = await AI.processBatch(batch);
            totalProcessed += processed;
            
            if (i + batchSize < products.length) {
                await new Promise(r => setTimeout(r, 500));
            }
        }
        
        return totalProcessed;
    },
    
    processBatch: async (products) => {
        const list = products.map((p, i) => `${i + 1}. ${p.title}`).join('\n');
        
        const prompt = `Analyze these products. Return JSON with "items" array.

For each product extract:
- category (e.g., "smartphones", "laptops", "headphones")
- subcategory (e.g., "android phones", "gaming laptops")  
- tags (array of features like ["5G", "OLED", "Gaming"])
- specifications (object like {"ram": "8GB", "storage": "128GB", "color": "Blue"})

Products:
${list}

Return format: {"items": [...]}`;
        
        try {
            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                },
                { 
                    headers: { 'Authorization': `Bearer ${CONFIG.GROQ_API_KEY}` },
                    timeout: 30000
                }
            );
            
            const result = JSON.parse(response.data.choices[0].message.content);
            const items = result.items || [];
            
            const updates = [];
            for (let i = 0; i < items.length && i < products.length; i++) {
                const p = products[i];
                const info = items[i];
                
                if (info) {
                    updates.push({
                        id: p.id,
                        category: info.category || p.category,
                        subcategory: info.subcategory || null,
                        tags: Array.isArray(info.tags) ? info.tags : [],
                        specifications: info.specifications || {}
                    });
                    
                    console.log(`      ✨ ${p.title.substring(0, 25)}... -> [${info.category}]`);
                }
            }
            
            if (updates.length > 0) {
                await DB.bulkUpdateAI(updates);
            }
            
            return updates.length;
            
        } catch (e) {
            console.error('   ❌ AI Batch Error:', e.message);
            return 0;
        }
    }
};

module.exports = AI;