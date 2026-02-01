const AI = require('../core/ai');
const { initDB, DB } = require('../core/db');

async function runAI() {
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   🧠 DEALHUNT AI PROCESSOR             ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    await initDB();
    
    // Check pending count
    const pending = await DB.query('SELECT COUNT(*) FROM products WHERE ai_processed = false');
    const pendingCount = parseInt(pending.rows[0].count);
    
    console.log(`📋 Pending products: ${pendingCount}\n`);
    
    if (pendingCount === 0) {
        console.log('✅ No products to process!');
        process.exit(0);
    }
    
    // Process all pending
    const limit = parseInt(process.env.AI_LIMIT) || 500;
    const processed = await AI.processQueue(limit);
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Final Stats
    const stats = await DB.getStats();
    
    console.log('\n📊 Results:');
    console.log(`   Processed: ${processed}`);
    console.log(`   Total AI Done: ${stats.ai_processed}`);
    console.log(`   Time: ${elapsed}s`);
    
    process.exit(0);
}

runAI().catch(e => {
    console.error('Fatal:', e);
    process.exit(1);
});