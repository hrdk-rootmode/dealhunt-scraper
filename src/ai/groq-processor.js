const axios = require('axios');
const { query } = require('../config/database');

class GroqProcessor {
    constructor(apiKey) {
        if (!apiKey) {
            throw new Error('Groq API key is required');
        }
        this.apiKey = apiKey;
        this.apiUrl = 'https://api.groq.com/openai/v1/chat/completions';
        this.model = 'llama-3.3-70b-versatile'; // Fast and accurate
    }

    async categorizeProduct(title, brand, currentCategory) {
        const prompt = `Analyze this product and categorize it.

Product: ${title}
Brand: ${brand}
Current Category: ${currentCategory}

Return ONLY a JSON object with this structure:
{"refined_category": "category name", "subcategory": "specific type", "tags": ["feature1", "feature2", "feature3", "feature4", "feature5"]}

Valid categories: Smartphones, Laptops, Tablets, Accessories, Wearables, Audio, Smart Home
Tags should be specific features (e.g., 5G, Fast Charging, AMOLED, etc.)`;

        try {
            const response = await axios.post(this.apiUrl, {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a product categorization expert. Always return valid JSON only, no explanations.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.3,
                max_tokens: 256,
                top_p: 1,
                stream: false
            }, {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 15000
            });

            const text = response.data.choices[0].message.content.trim();
            
            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.warn('No JSON found in Groq response');
                return null;
            }

            const result = JSON.parse(jsonMatch[0]);
            
            // Validate structure
            if (!result.refined_category || !result.subcategory || !Array.isArray(result.tags)) {
                console.warn('Invalid JSON structure from Groq');
                return null;
            }

            return result;

        } catch (error) {
            if (error.response) {
                console.error('Groq API error:', error.response.status, error.response.data?.error?.message || error.message);
            } else {
                console.error('Groq API error:', error.message);
            }
            return null;
        }
    }

    async processUnprocessedProducts(limit = 50) {
        try {
            // Get unprocessed products
            const result = await query(`
                SELECT id, title, brand, category
                FROM products
                WHERE ai_processed = false
                ORDER BY first_seen DESC
                LIMIT $1
            `, [limit]);

            const totalProducts = result.rows.length;

            console.log(`\n📊 Processing ${totalProducts} products with Groq AI...\n`);

            if (totalProducts === 0) {
                console.log('ℹ️  No unprocessed products found.\n');
                return { processed: 0, errors: 0 };
            }

            let processed = 0;
            let errors = 0;

            for (let i = 0; i < totalProducts; i++) {
                const product = result.rows[i];
                
                try {
                    console.log(`🤖 [${i + 1}/${totalProducts}] ${product.title.substring(0, 60)}...`);
                    
                    const aiResult = await this.categorizeProduct(
                        product.title,
                        product.brand,
                        product.category
                    );

                    if (aiResult) {
                        await query(`
                            UPDATE products
                            SET 
                                ai_category = $1,
                                subcategory = $2,
                                ai_tags = $3,
                                ai_processed = true
                            WHERE id = $4
                        `, [
                            aiResult.refined_category,
                            aiResult.subcategory,
                            aiResult.tags,
                            product.id
                        ]);

                        processed++;
                        console.log(`   ✅ ${aiResult.refined_category} > ${aiResult.subcategory}`);
                        console.log(`   🏷️  ${aiResult.tags.join(', ')}\n`);
                    } else {
                        errors++;
                        console.log('   ⚠️  Failed to get AI categorization\n');
                    }

                    // Rate limiting: Groq free tier = 30 RPM
                    // Wait 2 seconds between requests = max 30 per minute
                    if (i < totalProducts - 1) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }

                } catch (error) {
                    errors++;
                    console.error(`   ❌ Error: ${error.message}\n`);
                }
            }

            console.log('\n' + '='.repeat(60));
            console.log('🎉 AI PROCESSING COMPLETE');
            console.log('='.repeat(60));
            console.log(`✅ Successfully processed: ${processed}`);
            console.log(`❌ Errors: ${errors}`);
            console.log(`📊 Total: ${totalProducts}`);
            console.log(`📈 Success rate: ${totalProducts > 0 ? Math.round((processed / totalProducts) * 100) : 0}%`);
            console.log('='.repeat(60) + '\n');

            return { processed, errors };

        } catch (error) {
            console.error('❌ AI processing failed:', error.message);
            throw error;
        }
    }
}

module.exports = GroqProcessor;