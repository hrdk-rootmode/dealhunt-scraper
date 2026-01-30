/**
 * AI Product Processor using Groq
 * Processes up to 2000 unprocessed products
 * Run via: npm run ai:process OR GitHub Actions
 */

require('dotenv').config();
const GroqProcessor = require('./groq-processor');
const { pool } = require('../config/database');

// Configuration
const CONFIG = {
    batchSize: parseInt(process.env.AI_BATCH_SIZE) || 100,
    maxProducts: parseInt(process.env.AI_MAX_PRODUCTS) || 2000,
    delayBetweenBatches: 3000 // 3 seconds
};

async function main() {
    const startTime = Date.now();
    
    console.log('\n' + '='.repeat(70));
    console.log('🤖 AI PRODUCT PROCESSOR (Groq)');
    console.log('='.repeat(70));
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log(`🎯 Max Products: ${CONFIG.maxProducts}`);
    console.log(`📦 Batch Size: ${CONFIG.batchSize}`);
    console.log('='.repeat(70) + '\n');

    try {
        // Test database connection
        console.log('1️⃣ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Check if API key exists
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not found in environment variables');
        }
        console.log('2️⃣ Groq API key found ✅\n');

        // Check unprocessed products count
        console.log('3️⃣ Checking unprocessed products...');
        const countResult = await pool.query(`
            SELECT COUNT(*) as count 
            FROM products 
            WHERE ai_processed = false 
              AND is_available = true
              AND title IS NOT NULL
        `);
        const unprocessedCount = parseInt(countResult.rows[0].count);
        console.log(`📦 Found ${unprocessedCount} unprocessed products\n`);

        if (unprocessedCount === 0) {
            console.log('✅ No products to process. All done!\n');
            await pool.end();
            process.exit(0);
        }

        // Initialize processor
        const processor = new GroqProcessor(process.env.GROQ_API_KEY);

        // Calculate batches
        const productsToProcess = Math.min(unprocessedCount, CONFIG.maxProducts);
        const totalBatches = Math.ceil(productsToProcess / CONFIG.batchSize);
        
        console.log(`📋 Will process ${productsToProcess} products in ${totalBatches} batches\n`);

        let totalProcessed = 0;
        let totalErrors = 0;

        // Process in batches
        for (let batch = 1; batch <= totalBatches; batch++) {
            console.log('-'.repeat(60));
            console.log(`📦 Batch ${batch}/${totalBatches}`);
            console.log('-'.repeat(60));

            try {
                const result = await processor.processUnprocessedProducts(CONFIG.batchSize);
                
                if (result) {
                    totalProcessed += result.processed || CONFIG.batchSize;
                    totalErrors += result.errors || 0;
                }

                const progress = ((batch / totalBatches) * 100).toFixed(1);
                console.log(`📊 Progress: ${progress}% complete\n`);

                // Delay between batches (rate limiting)
                if (batch < totalBatches) {
                    console.log(`⏳ Waiting ${CONFIG.delayBetweenBatches / 1000}s before next batch...`);
                    await sleep(CONFIG.delayBetweenBatches);
                }

            } catch (batchError) {
                console.error(`❌ Batch ${batch} failed:`, batchError.message);
                totalErrors += CONFIG.batchSize;
                
                // Continue to next batch
                await sleep(5000);
            }
        }

        // Final summary
        const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

        console.log('\n' + '='.repeat(70));
        console.log('📊 AI PROCESSING SUMMARY');
        console.log('='.repeat(70));
        console.log(`✅ Products Processed: ~${totalProcessed}`);
        console.log(`❌ Errors: ~${totalErrors}`);
        console.log(`⏱️  Duration: ${totalDuration} minutes`);
        console.log(`📅 Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');

        // Verify final count
        const finalCount = await pool.query(`
            SELECT 
                COUNT(*) FILTER (WHERE ai_processed = true) as processed,
                COUNT(*) FILTER (WHERE ai_processed = false) as pending
            FROM products 
            WHERE is_available = true
        `);
        console.log(`📈 Database Status:`);
        console.log(`   - AI Processed: ${finalCount.rows[0].processed}`);
        console.log(`   - Pending: ${finalCount.rows[0].pending}\n`);

        // Write output for GitHub Actions
        if (process.env.GITHUB_OUTPUT) {
            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_processed=${totalProcessed}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_errors=${totalErrors}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_duration=${totalDuration}\n`);
        }

        console.log('✅ AI processing completed successfully\n');
        
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('\n' + '='.repeat(70));
        console.error('💥 AI PROCESSING FAILED');
        console.error('='.repeat(70));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(70) + '\n');
        
        try {
            await pool.end();
        } catch (e) {
            // Ignore
        }
        
        process.exit(1);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

main();