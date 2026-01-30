const axios = require('axios');
const { query } = require('../config/database');

class GeminiProcessor {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';
    }

    async categorizeProduct(title, brand, currentCategory) {
        const prompt = `
Analyze this product and provide categorization:

Product: ${title}
Brand: ${brand}
Current Category: ${currentCategory}

Return ONLY a JSON object with this exact structure (no markdown, no explanation):
{
    "refined_category": "main category",
    "subcategory": "specific subcategory",
    "tags": ["tag1", "tag2", "tag3"]
}

Categories should be one of: Smartphones, Laptops, Tablets, Accessories, Wearables, Audio, Smart Home
Tags should be specific features or characteristics (max 5 tags)
`;

        try {
            const response = await axios.post(
                `${this.apiUrl}?key=${this.apiKey}`,
                {
                    contents: [{
                        parts: [{
                            text: prompt
                        }]
                    }]
                },
                {
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 10000
                }
            );

            const text = response.data.candidates[0].content.parts[0].text;
            
            // Extract JSON from response
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                console.warn('No JSON found in Gemini response');
                return null;
            }

            const result = JSON.parse(jsonMatch[0]);
            return result;

        } catch (error) {
            console.error('Gemini API error:', error.message);
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

            console.log(`\n📊 Processing ${result.rows.length} products with Gemini AI...\n`);

            let processed = 0;
            let errors = 0;

            for (const product of result.rows) {
                try {
                    console.log(`🤖 Processing: ${product.title.substring(0, 60)}...`);
                    
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
                        console.log(`✅ Categorized as: ${aiResult.refined_category} > ${aiResult.subcategory}`);
                        console.log(`   Tags: ${aiResult.tags.join(', ')}\n`);
                    } else {
                        errors++;
                        console.log('⚠️  Failed to get AI categorization\n');
                    }

                    // Rate limiting - Gemini free tier: 60 requests/minute
                    await new Promise(resolve => setTimeout(resolve, 1500));

                } catch (error) {
                    errors++;
                    console.error(`❌ Error processing product ${product.id}:`, error.message, '\n');
                }
            }

            console.log('\n' + '='.repeat(50));
            console.log('🎉 AI PROCESSING COMPLETE');
            console.log('='.repeat(50));
            console.log(`✅ Successfully processed: ${processed}`);
            console.log(`❌ Errors: ${errors}`);
            console.log(`📊 Total: ${result.rows.length}`);
            console.log('='.repeat(50) + '\n');

            return { processed, errors };

        } catch (error) {
            console.error('❌ AI processing failed:', error.message);
            throw error;
        }
    }
}

module.exports = GeminiProcessor;