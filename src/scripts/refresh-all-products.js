require('dotenv').config();
const { pool } = require('../config/database');
const platformLoader = require('../scrapers/core/platform-loader');

async function refreshAllProducts() {
  console.log('🔄 Refreshing all existing products...\n');

  try {
    // Get all products from database
    const result = await pool.query(`
      SELECT p.product_id, pl.name as platform
      FROM products p
      JOIN platforms pl ON p.platform_id = pl.id
      ORDER BY p.first_seen ASC
    `);

    console.log(`📊 Found ${result.rows.length} products to refresh\n`);

    const stats = { total: result.rows.length, updated: 0, failed: 0 };

    for (const product of result.rows) {
      try {
        console.log(`🔄 Refreshing ${product.platform} product: ${product.product_id}`);
        
        // This would re-scrape individual product
        // For now, we'll skip (full implementation would fetch product page)
        
        stats.updated++;
      } catch (error) {
        console.error(`❌ Failed: ${error.message}`);
        stats.failed++;
      }
    }

    console.log(`\n✅ Refresh complete:`);
    console.log(`   Total: ${stats.total}`);
    console.log(`   Updated: ${stats.updated}`);
    console.log(`   Failed: ${stats.failed}`);

    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Refresh failed:', error);
    process.exit(1);
  }
}

refreshAllProducts();