#!/usr/bin/env node

/**
 * Scrape All Platforms Script
 * Scrapes products from all available platforms
 * Usage: node src/scripts/scrape-all-platforms.js [maxProducts]
 * Example: node src/scripts/scrape-all-platforms.js 1000
 */

require('dotenv').config();

const platformLoader = require('../scrapers/core/platform-loader');
const { connectRedis, cache } = require('../config/redis');
const { pool } = require('../config/database');

// Parse command line arguments
const maxProducts = parseInt(process.argv[2]) || 1000;

console.log('\n' + '='.repeat(70));
console.log('🚀 DEALHUNT SCRAPER - MULTI-PLATFORM BULK SCRAPING');
console.log('='.repeat(70));
console.log(`📅 Started: ${new Date().toISOString()}`);
console.log(`🎯 Target: ${maxProducts} products per platform`);
console.log('='.repeat(70) + '\n');

async function scrapeAllPlatforms() {
    try {
        // Connect to database
        console.log('🔌 Connecting to database...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected\n');

        // Connect to Redis
        console.log('🔌 Connecting to Redis...');
        await connectRedis();
        console.log('✅ Redis connected\n');

        // Get available platforms
        const platforms = platformLoader.listPlatforms();
        
        if (platforms.length === 0) {
            console.error('❌ No platforms found!');
            process.exit(1);
        }

        console.log(`📋 Platforms to scrape: ${platforms.join(', ')}`);
        console.log(`📦 Products per platform: ${maxProducts}\n`);
        console.log('='.repeat(70) + '\n');

        const results = {};
        let totalProducts = 0;
        let totalErrors = 0;

        // Scrape each platform
        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            const isLast = i === platforms.length - 1;

            try {
                console.log(`\n${'─'.repeat(70)}`);
                console.log(`⏳ Scraping ${platform.toUpperCase()}...`);
                console.log(`${'─'.repeat(70)}`);

                // Update cache status
                await cache.setScrapingStatus(platform, {
                    status: 'running',
                    startedAt: new Date().toISOString(),
                    platform: platform
                });

                const startTime = Date.now();
                const scraper = platformLoader.getPlatform(platform);
                
                // Execute scrape
                const result = await scraper.scrape({ maxProducts });
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                const productsScraped = result?.length || 0;

                results[platform] = {
                    status: 'success',
                    products: productsScraped,
                    duration: `${duration}s`,
                    timestamp: new Date().toISOString()
                };

                totalProducts += productsScraped;

                // Update cache status
                await cache.setScrapingStatus(platform, {
                    status: 'completed',
                    completedAt: new Date().toISOString(),
                    platform: platform,
                    productsScraped: productsScraped,
                    duration: `${duration}s`
                });

                console.log(`✅ ${platform}: ${productsScraped} products scraped in ${duration}s`);

                // Respectful delay between platforms
                if (!isLast) {
                    const delaySeconds = 10;
                    console.log(`⏳ Waiting ${delaySeconds} seconds before next platform...`);
                    await new Promise(r => setTimeout(r, delaySeconds * 1000));
                }

            } catch (err) {
                totalErrors++;
                results[platform] = {
                    status: 'failed',
                    error: err.message,
                    timestamp: new Date().toISOString()
                };

                // Update cache status
                await cache.setScrapingStatus(platform, {
                    status: 'failed',
                    error: err.message,
                    failedAt: new Date().toISOString(),
                    platform: platform
                });

                console.error(`❌ ${platform}: ${err.message}`);
            }
        }

        // Print summary
        console.log('\n' + '='.repeat(70));
        console.log('📊 SCRAPING SUMMARY');
        console.log('='.repeat(70));
        
        Object.entries(results).forEach(([platform, result]) => {
            const icon = result.status === 'success' ? '✅' : '❌';
            const info = result.status === 'success'
                ? `${result.products} products (${result.duration})`
                : result.error;
            console.log(`${icon} ${platform.padEnd(15)}: ${info}`);
        });

        console.log('='.repeat(70));
        console.log(`📈 Total Products Scraped: ${totalProducts}`);
        console.log(`⚠️  Total Errors: ${totalErrors}`);
        console.log(`📅 Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');

        // Get final stats
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) as total_products,
                COUNT(DISTINCT brand) as total_brands,
                COUNT(DISTINCT category) as total_categories
            FROM products
            WHERE is_available = true
        `);

        const stats = statsResult.rows[0];
        console.log('📊 DATABASE STATISTICS:');
        console.log(`   Total Products: ${stats.total_products}`);
        console.log(`   Total Brands: ${stats.total_brands}`);
        console.log(`   Total Categories: ${stats.total_categories}\n`);

        // Exit with success
        process.exit(totalErrors === 0 ? 0 : 1);

    } catch (error) {
        console.error('\n' + '='.repeat(70));
        console.error('❌ SCRAPING FAILED');
        console.error('='.repeat(70));
        console.error('Error:', error.message);
        console.error(error.stack);
        console.error('='.repeat(70) + '\n');
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n👋 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n👋 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

// Start scraping
scrapeAllPlatforms();
