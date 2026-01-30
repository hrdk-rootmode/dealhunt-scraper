require('dotenv').config();
const GroqProcessor = require('./groq-processor');
const { pool } = require('../config/database');

async function main() {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 Starting AI Product Processing (Groq)');
    console.log('='.repeat(60) + '\n');

    try {
        // Test database connection
        console.log('1️⃣ Testing database connection...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Check if API key exists
        if (!process.env.GROQ_API_KEY) {
            throw new Error('GROQ_API_KEY not found in .env file');
        }
        console.log('✅ Groq API key found\n');

        // Initialize processor
        const processor = new GroqProcessor(process.env.GROQ_API_KEY);

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