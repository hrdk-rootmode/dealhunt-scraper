const { query } = require('../config/database');

class Product {
  
  // ========== SMART UPSERT (UPDATES ALL FIELDS PROPERLY) ==========
  
  static async upsert(productData) {
    const {
      product_id,
      platform_id,
      title,
      brand,
      category,
      subcategory,
      image_url,
      product_url,
      current_price,
      original_price,
      discount_percent,
      is_available,
      rating,
      review_count,
      specifications
    } = productData;

    // Smart UPSERT: Updates ALL fields, prioritizes new non-null values
    const sql = `
      INSERT INTO products (
        product_id, platform_id, title, brand, category, subcategory,
        image_url, product_url, current_price, original_price,
        discount_percent, is_available, rating, review_count, specifications
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (product_id) 
      DO UPDATE SET
        -- Always update these (latest data)
        title = EXCLUDED.title,
        brand = EXCLUDED.brand,
        category = EXCLUDED.category,
        subcategory = COALESCE(EXCLUDED.subcategory, products.subcategory),
        image_url = COALESCE(EXCLUDED.image_url, products.image_url),
        product_url = COALESCE(EXCLUDED.product_url, products.product_url),
        
        -- Price updates (always take latest)
        current_price = EXCLUDED.current_price,
        original_price = EXCLUDED.original_price,
        discount_percent = EXCLUDED.discount_percent,
        is_available = EXCLUDED.is_available,
        
        -- Rating: Take new value if exists, otherwise keep old
        rating = CASE 
          WHEN EXCLUDED.rating IS NOT NULL THEN EXCLUDED.rating
          ELSE products.rating
        END,
        
        -- Review count: Take higher value (never decrease)
        review_count = CASE 
          WHEN EXCLUDED.review_count > products.review_count THEN EXCLUDED.review_count
          WHEN EXCLUDED.review_count > 0 THEN EXCLUDED.review_count
          ELSE products.review_count
        END,
        
        -- Specifications: Merge new specs with existing (don't lose data)
        specifications = CASE 
          WHEN EXCLUDED.specifications::text != '{}' AND EXCLUDED.specifications::text != 'null'
          THEN EXCLUDED.specifications
          ELSE products.specifications
        END,
        
        -- Tracking
        scrape_count = products.scrape_count + 1,
        last_updated = CURRENT_TIMESTAMP
        
      RETURNING id, (xmax = 0) AS inserted
    `;

    try {
      const result = await query(sql, [
        product_id, 
        platform_id, 
        title, 
        brand, 
        category, 
        subcategory,
        image_url, 
        product_url, 
        current_price, 
        original_price,
        discount_percent, 
        is_available, 
        rating, 
        review_count,
        JSON.stringify(specifications || {})
      ]);

      return {
        id: result.rows[0].id,
        isNew: result.rows[0].inserted
      };
    } catch (error) {
      console.error('❌ Product upsert error:', error.message);
      throw error;
    }
  }

  // ========== ADD PRICE HISTORY ==========
  
  static async addPriceHistory(productId, priceData) {
    const sql = `
      INSERT INTO price_history (
        product_id, price, original_price, discount_percent, is_available
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `;

    try {
      const result = await query(sql, [
        productId,
        priceData.current_price,
        priceData.original_price,
        priceData.discount_percent,
        priceData.is_available
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Price history error:', error.message);
      throw error;
    }
  }

  // ========== GET PLATFORM ID ==========
  
  static async getPlatformId(platformName) {
    const sql = 'SELECT id FROM platforms WHERE LOWER(name) = LOWER($1)';
    const result = await query(sql, [platformName]);
    return result.rows[0]?.id;
  }

  // ========== LOG SCRAPE SESSION ==========
  
  static async logScrape(logData) {
    const sql = `
      INSERT INTO scrape_logs (
        platform_id, status, products_scraped, products_new,
        products_updated, errors, started_at, completed_at, duration_seconds
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id
    `;

    try {
      const result = await query(sql, [
        logData.platform_id,
        logData.status,
        logData.products_scraped,
        logData.products_new,
        logData.products_updated,
        logData.errors,
        logData.started_at,
        logData.completed_at,
        logData.duration_seconds
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Scrape log error:', error.message);
    }
  }

  // ========== UPDATE PRODUCT (FOR REFRESH FEATURE) ==========
  
  static async updateFromDetailPage(productId, enhancedData) {
    const sql = `
      UPDATE products SET
        title = COALESCE($1, title),
        current_price = COALESCE($2, current_price),
        original_price = COALESCE($3, original_price),
        rating = COALESCE($4, rating),
        review_count = GREATEST($5, review_count),
        specifications = CASE 
          WHEN $6::text != '{}' THEN $6::jsonb
          ELSE specifications
        END,
        brand = COALESCE($7, brand),
        is_available = COALESCE($8, is_available),
        last_updated = CURRENT_TIMESTAMP,
        scrape_count = scrape_count + 1
      WHERE id = $9
      RETURNING *
    `;

    try {
      const result = await query(sql, [
        enhancedData.title,
        enhancedData.current_price,
        enhancedData.original_price,
        enhancedData.rating,
        enhancedData.review_count || 0,
        JSON.stringify(enhancedData.specifications || {}),
        enhancedData.brand,
        enhancedData.is_available,
        productId
      ]);
      return result.rows[0];
    } catch (error) {
      console.error('❌ Update from detail page error:', error.message);
      throw error;
    }
  }

  // ========== GET PRODUCTS NEEDING REFRESH ==========
  
  static async getIncompleteProducts(limit = 50) {
    const sql = `
      SELECT id, product_id, title, product_url, rating, review_count, specifications
      FROM products
      WHERE rating IS NULL 
         OR review_count = 0 
         OR specifications = '{}'::jsonb
      ORDER BY last_updated ASC
      LIMIT $1
    `;

    const result = await query(sql, [limit]);
    return result.rows;
  }

  // ========== GET PRODUCTS BY CATEGORY ==========
  
  static async getByCategory(category, limit = 20, offset = 0) {
    const sql = `
      SELECT p.*, pl.name as platform_name
      FROM products p
      JOIN platforms pl ON p.platform_id = pl.id
      WHERE LOWER(p.category) = LOWER($1)
        AND p.is_available = true
      ORDER BY p.last_updated DESC
      LIMIT $2 OFFSET $3
    `;

    const result = await query(sql, [category, limit, offset]);
    return result.rows;
  }

  // ========== GET CATEGORY STATS ==========
  
  static async getCategoryStats() {
    const sql = `
      SELECT 
        category,
        COUNT(*) as total_products,
        ROUND(AVG(current_price)::numeric, 2) as avg_price,
        COUNT(CASE WHEN rating IS NOT NULL THEN 1 END) as with_rating,
        COUNT(CASE WHEN review_count > 0 THEN 1 END) as with_reviews
      FROM products
      WHERE is_available = true
      GROUP BY category
      ORDER BY total_products DESC
    `;

    const result = await query(sql);
    return result.rows;
  }

  // ========== GET PLATFORM STATS ==========
  
  static async getPlatformStats() {
    const sql = `
      SELECT 
        pl.name as platform,
        COUNT(p.id) as total_products,
        COUNT(CASE WHEN p.rating IS NOT NULL THEN 1 END) as with_rating,
        COUNT(CASE WHEN p.review_count > 0 THEN 1 END) as with_reviews,
        ROUND(AVG(p.current_price)::numeric, 2) as avg_price,
        MAX(p.last_updated) as last_updated
      FROM products p
      JOIN platforms pl ON p.platform_id = pl.id
      GROUP BY pl.name
      ORDER BY total_products DESC
    `;

    const result = await query(sql);
    return result.rows;
  }

  // ========== DATABASE HEALTH CHECK ==========
  
  static async getDatabaseHealth() {
    const sql = `
      SELECT 
        (SELECT COUNT(*) FROM products) as total_products,
        (SELECT COUNT(*) FROM products WHERE is_available = true) as available_products,
        (SELECT COUNT(*) FROM products WHERE rating IS NOT NULL) as with_rating,
        (SELECT COUNT(*) FROM products WHERE review_count > 0) as with_reviews,
        (SELECT COUNT(*) FROM products WHERE ai_processed = true) as ai_processed,
        (SELECT COUNT(*) FROM price_history) as price_history_count,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) as database_size
    `;

    const result = await query(sql);
    return result.rows[0];
  }
}

module.exports = Product;