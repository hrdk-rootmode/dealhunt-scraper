const { initDB, DB } = require('../core/db');
const GitHubBackup = require('./github-backup');
require('dotenv').config();

const RETENTION_MONTHS = parseInt(process.env.DATA_RETENTION_MONTHS) || 6;

async function runMonthlyCleanup() {
    const startTime = Date.now();
    const today = new Date();
    const yearMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         🧹 DEALHUNT MONTHLY CLEANUP                    ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\n📅 Date: ${today.toISOString().split('T')[0]}`);
    console.log(`📦 Retention: ${RETENTION_MONTHS} months\n`);
    
    await initDB();
    
    try {
        // ═══════════════════════════════════════
        // PHASE 1: BACKUP BEFORE DELETE
        // ═══════════════════════════════════════
        
        console.log('═'.repeat(60));
        console.log('💾 PHASE 1: BACKUP OLD DATA');
        console.log('═'.repeat(60) + '\n');
        
        // Get products to backup
        console.log('   📦 Fetching products...');
        const products = await DB.getProductsForBackup(50000, 0);
        console.log(`   Found: ${products.length} products`);
        
        // Backup products
        const productBackup = {
            exportDate: new Date().toISOString(),
            totalProducts: products.length,
            products: products
        };
        
        await GitHubBackup.backupMonthlyProducts(yearMonth, productBackup);
        
        // Get and backup price history
        console.log('   💰 Fetching price history...');
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() - RETENTION_MONTHS);
        
        const prices = await DB.getPriceHistoryForBackup(
            cutoffDate.toISOString(),
            new Date().toISOString()
        );
        console.log(`   Found: ${prices.length} price records`);
        
        const priceBackup = {
            exportDate: new Date().toISOString(),
            totalRecords: prices.length,
            dateRange: {
                from: cutoffDate.toISOString(),
                to: new Date().toISOString()
            },
            prices: prices
        };
        
        await GitHubBackup.backupMonthlyPrices(yearMonth, priceBackup);
        
        // ═══════════════════════════════════════
        // PHASE 2: DELETE OLD DATA
        // ═══════════════════════════════════════
        
        console.log('\n' + '═'.repeat(60));
        console.log('🗑️  PHASE 2: DELETE OLD DATA');
        console.log('═'.repeat(60) + '\n');
        
        console.log(`   Deleting data older than ${RETENTION_MONTHS} months...`);
        
        const deleteResult = await DB.deleteOldData(RETENTION_MONTHS);
        
        console.log(`   ✅ Price History Deleted: ${deleteResult.priceHistoryDeleted}`);
        console.log(`   ✅ Products Deleted: ${deleteResult.productsDeleted}`);
        
        // ═══════════════════════════════════════
        // FINAL REPORT
        // ═══════════════════════════════════════
        
        const stats = await DB.getStats();
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║              📊 CLEANUP REPORT                         ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
        
        console.log(`   📦 Products Backed Up:      ${products.length}`);
        console.log(`   💰 Prices Backed Up:        ${prices.length}`);
        console.log(`   🗑️  Price History Deleted:  ${deleteResult.priceHistoryDeleted}`);
        console.log(`   🗑️  Products Deleted:       ${deleteResult.productsDeleted}`);
        console.log(`   📊 Remaining in DB:         ${stats.products}`);
        console.log(`   ⏱️  Duration:               ${duration}s`);
        
        console.log('\n╔════════════════════════════════════════════════════════╗');
        console.log('║         ✅ MONTHLY CLEANUP COMPLETE!                   ║');
        console.log('╚════════════════════════════════════════════════════════╝\n');
        
    } catch (e) {
        console.error('\n❌ CLEANUP ERROR:', e.message);
        console.error(e);
    }
    
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    runMonthlyCleanup().catch(e => {
        console.error('❌ Fatal:', e.message);
        process.exit(1);
    });
}

module.exports = { runMonthlyCleanup };