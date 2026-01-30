require('dotenv').config();
const GeminiProcessor = require('./gemini-processor');
const { pool } = require('../config/database');

async function main() {
    console.log('\n' + '='.repeat(50));
    console.log('🤖 Starting AI Product Processing');
    console.log('='.repeat(50) + '\n');

    try {
        // Test database connection
        console.log('1️⃣ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Check if API key exists
        if (!process.env.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY not found in environment variables');
        }
        console.log('✅ Gemini API key found\n');

        // Initialize processor
        const processor = new GeminiProcessor(process.env.GEMINI_API_KEY);

        // Process products (100 at a time)
        await processor.processUnprocessedProducts(100);

        console.log('✅ AI processing completed successfully\n');
        
        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ AI processing failed:', error.message);
        console.error('Full error:', error, '\n');
        process.exit(1);
    }
}

main();