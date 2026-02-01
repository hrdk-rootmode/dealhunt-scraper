const Scraper = require('../core/scraper');
const AI = require('../core/ai');
const { initDB, DB } = require('../core/db');

const SEED_QUERIES = [
    'smartphones',
    'laptops',
    'headphones',
    'smart watches',
    'tablets',
    'televisions'
];

async function runSeed() {
    const startTime = Date.now();
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   ⚡ DEALHUNT TURBO SEEDER             ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    await initDB();
    
    const limitPerQuery = parseInt(process.env.SEED_LIMIT) || 50;
    const platforms = Scraper.getAvailable();
    
    let totalNew = 0;
    let totalUpdated = 0;
    
    for (const platform of platforms) {
        console.log(`\n${'═'.repeat(50)}`);
        console.log(`📦 PLATFORM: ${platform.toUpperCase()}`);
        console.log(`${'═'.repeat(50)}`);
        
        for (const query of SEED_QUERIES) {
            console.log(`\n🔍 "${query}"`);
            
            try {
                const result = await Scraper.run(platform, query, limitPerQuery);
                
                if (result.skipped) {
                    console.log(`   ⏭️ Skipped`);
                    continue;
                }
                
                totalNew += result.saved || 0;
                totalUpdated += result.duplicates || 0;
                
                // Delay between queries
                await new Promise(r => setTimeout(r, 2000));
                
            } catch (e) {
                console.error(`   ❌ ${e.message}`);
            }
        }
        
        // Longer delay between platforms
        console.log('\n   ⏸️ Cooling down...');
        await new Promise(r => setTimeout(r, 5000));
    }
    
    // AI Processing
    console.log('\n' + '═'.repeat(50));
    console.log('🧠 RUNNING AI CATEGORIZATION...');
    console.log('═'.repeat(50) + '\n');
    
    await AI.processQueue(500);
    
    // Final Stats
    const stats = await DB.getStats();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   📊 FINAL STATISTICS                  ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    console.log(`   📦 Total Products:   ${stats.products}`);
    console.log(`   🆕 New This Run:     ${totalNew}`);
    console.log(`   🔄 Updated:          ${totalUpdated}`);
    console.log(`   🧠 AI Processed:     ${stats.ai_processed}`);
    console.log(`   ⏱️  Time:             ${elapsed}s`);
    
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║   ✅ SEED COMPLETE!                    ║');
    console.log('╚════════════════════════════════════════╝\n');
    
    process.exit(0);
}

runSeed().catch(e => {
    console.error('\n❌ Fatal:', e.message);
    process.exit(1);
});