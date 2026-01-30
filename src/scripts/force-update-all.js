require('dotenv').config();
const { pool } = require('../config/database');

async function forceUpdateAll() {
  console.log('🔄 Force updating all products to re-scrape with new data...\n');

  try {
    // Mark all products as "needs update" by setting old timestamp
    const result = await pool.query(`
      UPDATE products 
      SET last_updated = '2020-01-01'
      WHERE rating IS NULL 
         OR review_count = 0 
         OR specifications = '{}'
         OR ai_processed = false
      RETURNING product_id, title
    `);

    console.log(`📊 Marked ${result.rows.length} products for re-scraping\n`);

    result.rows.forEach(p => {
      console.log(`✅ ${p.product_id}: ${p.title.substring(0, 60)}...`);
    });

    console.log(`\n✅ Next scrape will fetch fresh data for these products!`);
    
    await pool.end();
    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

forceUpdateAll();