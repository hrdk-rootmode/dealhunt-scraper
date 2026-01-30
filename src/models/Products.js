const { query } = require('../config/database');

class Product {
    // Insert or update product (UPSERT)
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

        const sql = `
            INSERT INTO products (
                product_id, platform_id, title, brand, category, subcategory,
                image_url, product_url, current_price, original_price,
                discount_percent, is_available, rating, review_count, specifications
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (product_id) 
            DO UPDATE SET
                title = EXCLUDED.title,
                current_price = EXCLUDED.current_price,
                original_price = EXCLUDED.original_price,
                discount_percent = EXCLUDED.discount_percent,
                is_available = EXCLUDED.is_available,
                rating = EXCLUDED.rating,
                review_count = EXCLUDED.review_count,
                image_url = EXCLUDED.image_url,
                scrape_count = products.scrape_count + 1,
                last_updated = CURRENT_TIMESTAMP
            RETURNING id, (xmax = 0) AS inserted
        `;

        try {
            const result = await query(sql, [
                product_id, platform_id, title, brand, category, subcategory,
                image_url, product_url, current_price, original_price,
                discount_percent, is_available, rating, review_count,
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

    // Add price to history
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

    // Get platform ID by name
    static async getPlatformId(platformName) {
        const sql = 'SELECT id FROM platforms WHERE name = $1';
        const result = await query(sql, [platformName]);
        return result.rows[0]?.id;
    }

    // Log scraping session
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
}

module.exports = Product;