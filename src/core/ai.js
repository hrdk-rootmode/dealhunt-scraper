const axios = require('axios');
const CONFIG = require('../config');
const { DB } = require('./db');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ═══════════════════════════════════════════════
// RATE LIMITER - Enforce 1 request per 7 seconds (Groq free tier = ~8-10 req/min)
// ═══════════════════════════════════════════════
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 7000; // 7 seconds between requests

const enforceRateLimit = async () => {
    const now = Date.now();
    const timeSinceLastRequest = now - lastRequestTime;
    
    if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
        const waitMs = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
        await sleep(waitMs);
    }
    
    lastRequestTime = Date.now();
};

// ═══════════════════════════════════════════════
// SAFE RETRY CHECKER
// ═══════════════════════════════════════════════

function isRetryableError(err) {
    if (!err.response) return true; // Network errors (timeout, ECONNRESET)

    const status = err.response.status;
    const retryableStatuses = [429, 502, 503, 504];
    return retryableStatuses.includes(status);
}

// ═══════════════════════════════════════════════
// AI MODULE
// ═══════════════════════════════════════════════

const AI = {
    // === SMART SELECTOR HEALING ===
    healSelector: async (platformName, field, htmlSnippet, hint = '') => {
        if (!CONFIG.GROQ_API_KEY) {
            console.warn('   ⚠️ Groq API Key missing');
            return null;
        }

        let fieldHint = hint;
        if (!fieldHint) {
            const hints = {
                title: 'product name/title text',
                price: 'current selling price (with currency symbol like ₹)',
                mrp: 'original/strike-through price (MRP)',
                rating: 'star rating (like 4.5)',
                reviews: 'number of reviews/ratings',
                image: 'product image',
                link: 'product detail page link',
                product_card: 'container div that holds one product'
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
                    response_format: { type: 'json_object' },
                    temperature: 0.1
                },
                {
                    headers: { Authorization: `Bearer ${CONFIG.GROQ_API_KEY}` },
                    timeout: 20000
                }
            );

            const result = JSON.parse(response.data.choices[0].message.content);

            if (result.selector) {
                const badPatterns = [
                    '#productTitle',
                    '#title',
                    '#price',
                    '[cel_widget_id',
                    '[data-cel-widget',
                    'MAIN-SEARCH',
                    'MAIN-',
                    ':nth-child'
                ];

                const isBad = badPatterns.some((p) => result.selector.includes(p));
                if (isBad) {
                    console.log(`   ⚠️ AI returned invalid selector: ${result.selector}`);
                    return null;
                }

                try {
                    await DB.query(
                        `
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
                    `,
                        [JSON.stringify([result.selector]), platformName]
                    );
                } catch (dbErr) {
                    console.log(`   ⚠️ DB update fallback`);
                }

                return result.selector;
            }
        } catch (e) {
            console.error(`   ❌ AI Error:`, e.message);
        }

        return null;
    },

    // === BATCH CATEGORIZATION (Robust) ===
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

        console.log(`   🤖 Processing ${products.length} products...\n`);

        // Start very conservative for free tier: 1-2 products per request
        let batchSize = 1;
        let totalProcessed = 0;
        let consecutiveFailures = 0;

        for (let i = 0; i < products.length; i += batchSize) {
            const batch = products.slice(i, i + batchSize);

            // Process with request-level rate limiting
            const result = await AI.processBatch(batch, 0);
            totalProcessed += result.processed;
            
            if (result.rateLimited) {
                consecutiveFailures++;
                // Aggressive cooldown on rate limit
                const cooldownMs = 120000 + (consecutiveFailures * 60000); // 2min + backoff
                console.log(`   ⏸️ Rate limited. Cooling down ${Math.round(cooldownMs / 1000)}s before retry...\n`);
                await sleep(cooldownMs);
                // Reset batch size to 1 on rate limit
                batchSize = 1;
            } else {
                consecutiveFailures = 0;
                // Gradually increase batch size on success (1 → 2 → 3 max)
                if (batchSize < 3) {
                    batchSize = Math.min(3, batchSize + 1);
                }
            }
        }

        return totalProcessed;
    },

    // === ROBUST BATCH PROCESSOR (Request-level rate limiting) ===
    processBatch: async (products, retryCount = 0) => {
        const MAX_RETRIES = 1;

        if (!products || products.length === 0) return { processed: 0, rateLimited: false };

        if (retryCount > MAX_RETRIES) {
            console.log(`   ❌ Skipping batch after max retries`);
            return { processed: 0, rateLimited: true };
        }

        // Sanitize product titles
        const sanitizedProducts = products.map(p => ({
            ...p,
            title: p.title.replace(/[^a-zA-Z0-9\s\-\(\)\.\,\&]/g, '').substring(0, 150)
        }));

        const list = sanitizedProducts.map((p, i) => `${i + 1}. ${p.title}`).join('\n');

        const prompt = `Analyze these products. Return JSON with "items" array.

For each product extract:
- category (e.g., "smartphones", "laptops", "headphones")
- subcategory (e.g., "android phones", "gaming laptops") 
- tags (array of 2-3 features like ["5G", "OLED"])
- specifications (max 3 key specs like {"ram": "8GB", "storage": "128GB"})

Products:
${list}

Return: {"items": [...]}`;

        try {
            // ENFORCE REQUEST-LEVEL RATE LIMIT before making API call
            await enforceRateLimit();
            
            console.log(`   📤 Sending request for ${products.length} product(s)...`);

            const response = await axios.post(
                'https://api.groq.com/openai/v1/chat/completions',
                {
                    model: 'llama-3.3-70b-versatile',
                    messages: [{ role: 'user', content: prompt }],
                    response_format: { type: 'json_object' },
                    temperature: 0.1,
                    max_tokens: 1000
                },
                {
                    headers: { Authorization: `Bearer ${CONFIG.GROQ_API_KEY}` },
                    timeout: 30000
                }
            );

            const result = JSON.parse(response.data.choices[0].message.content);
            const items = result.items || [];

            const updates = [];
            for (let i = 0; i < items.length && i < products.length; i++) {
                const p = products[i];
                const info = items[i];

                if (info && info.category) {
                    updates.push({
                        id: p.id,
                        category: info.category,
                        subcategory: info.subcategory || null,
                        tags: Array.isArray(info.tags) ? info.tags : [],
                        specifications: info.specifications || {}
                    });

                    const categoryStr = info.category ? `[${info.category}]` : '';
                    console.log(`      ✅ ${p.title.substring(0, 30)}... ${categoryStr}`);
                }
            }

            if (updates.length > 0) {
                await DB.bulkUpdateAI(updates);
            }

            return { processed: updates.length, rateLimited: false };
        } catch (e) {
            const status = e?.response?.status;
            const errorMsg = e.message || 'Unknown error';

            // === RATE LIMIT (429) ===
            if (status === 429) {
                console.log(`   ⚠️ 429 Rate Limited. Will reduce batch size.`);
                return { processed: 0, rateLimited: true };
            }

            // === NON-RETRYABLE CLIENT ERRORS ===
            if (status >= 400 && status < 500) {
                console.error(`   ❌ Client error (${status}): ${errorMsg}`);
                return { processed: 0, rateLimited: false };
            }

            // === NETWORK/SERVER ERRORS - Retry once ===
            if (retryCount < MAX_RETRIES) {
                console.log(`   ⚠️ Network error. Waiting 8s before retry...`);
                await sleep(8000);
                return AI.processBatch(products, retryCount + 1);
            }

            console.error(`   ❌ Failed after retries:`, errorMsg);
            return { processed: 0, rateLimited: false };
        }
    }
};

module.exports = AI;