/**
 * Multi-Platform Scraper Script
 * Scrapes 1000 products each from Amazon & Flipkart
 * Run via: npm run scrape OR GitHub Actions
 */

require('dotenv').config();
const { pool } = require('../config/database');
const { connectRedis } = require('../config/redis');
const platformLoader = require('../scrapers/core/platform-loader');

// Configuration
const CONFIG = {
    productsPerPlatform: parseInt(process.env.SCRAPE_LIMIT) || 1000,
    delayBetweenPlatforms: 10000, // 10 seconds
    retryAttempts: 3
};

async function scrapeAllPlatforms() {
    const startTime = Date.now();
    const results = {};
    
    console.log('\n' + '='.repeat(70));
    console.log('🕷️  DEALHUNT MULTI-PLATFORM SCRAPER');
    console.log('='.repeat(70));
    console.log(`📅 Started: ${new Date().toISOString()}`);
    console.log(`🎯 Target: ${CONFIG.productsPerPlatform} products per platform`);
    console.log('='.repeat(70) + '\n');

    try {
        // Initialize connections
        console.log('📡 Initializing connections...');
        await pool.query('SELECT NOW()');
        console.log('✅ Database connected');
        
        await connectRedis();
        console.log('✅ Redis connected\n');

        // Get available platforms
        const platforms = platformLoader.getAvailablePlatforms();
        console.log(`📋 Platforms to scrape: ${platforms.join(', ')}`);
        console.log(`📦 Total target: ${platforms.length * CONFIG.productsPerPlatform} products\n`);

        // Scrape each platform
        for (let i = 0; i < platforms.length; i++) {
            const platform = platforms[i];
            const platformStartTime = Date.now();
            
            console.log('\n' + '-'.repeat(60));
            console.log(`🔄 [${i + 1}/${platforms.length}] Scraping ${platform.toUpperCase()}...`);
            console.log('-'.repeat(60));

            let attempt = 0;
            let success = false;

            while (attempt < CONFIG.retryAttempts && !success) {
                attempt++;
                
                try {
                    if (attempt > 1) {
                        console.log(`🔁 Retry attempt ${attempt}/${CONFIG.retryAttempts}...`);
                        await sleep(5000);
                    }

                    const scraper = platformLoader.getScraper(platform);
                    const products = await scraper.scrape({ 
                        maxProducts: CONFIG.productsPerPlatform 
                    });

                    const duration = ((Date.now() - platformStartTime) / 1000).toFixed(1);
                    const productCount = products?.length || 0;

                    results[platform] = {
                        status: 'success',
                        products: productCount,
                        duration: `${duration}s`,
                        attempt: attempt
                    };

                    console.log(`\n✅ ${platform.toUpperCase()}: ${productCount} products scraped in ${duration}s`);
                    success = true;

                } catch (error) {
                    console.error(`❌ Attempt ${attempt} failed:`, error.message);
                    
                    if (attempt === CONFIG.retryAttempts) {
                        results[platform] = {
                            status: 'failed',
                            error: error.message,
                            attempts: attempt
                        };
                    }
                }
            }

            // Delay between platforms (except for last one)
            if (i < platforms.length - 1) {
                console.log(`\n⏳ Waiting ${CONFIG.delayBetweenPlatforms / 1000}s before next platform...`);
                await sleep(CONFIG.delayBetweenPlatforms);
            }
        }

        // Final summary
        const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
        const totalProducts = Object.values(results)
            .filter(r => r.status === 'success')
            .reduce((sum, r) => sum + r.products, 0);
        const successCount = Object.values(results).filter(r => r.status === 'success').length;
        const failCount = Object.values(results).filter(r => r.status === 'failed').length;

        console.log('\n' + '='.repeat(70));
        console.log('📊 SCRAPING SUMMARY');
        console.log('='.repeat(70));
        
        Object.entries(results).forEach(([platform, result]) => {
            const icon = result.status === 'success' ? '✅' : '❌';
            const info = result.status === 'success' 
                ? `${result.products} products (${result.duration})`
                : `Failed: ${result.error}`;
            console.log(`${icon} ${platform.padEnd(12)}: ${info}`);
        });
        
        console.log('-'.repeat(70));
        console.log(`📦 Total Products Scraped: ${totalProducts}`);
        console.log(`✅ Successful: ${successCount}/${Object.keys(results).length} platforms`);
        console.log(`❌ Failed: ${failCount}/${Object.keys(results).length} platforms`);
        console.log(`⏱️  Total Duration: ${totalDuration} minutes`);
        console.log(`📅 Completed: ${new Date().toISOString()}`);
        console.log('='.repeat(70) + '\n');

        // Write output for GitHub Actions
        if (process.env.GITHUB_OUTPUT) {
            const fs = require('fs');
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `total_products=${totalProducts}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `platforms_scraped=${successCount}\n`);
            fs.appendFileSync(process.env.GITHUB_OUTPUT, `duration_minutes=${totalDuration}\n`);
        }

        // Exit with error if all platforms failed
        if (successCount === 0) {
            console.error('💥 All platforms failed!');
            process.exit(1);
        }

        return results;

    } catch (error) {
        console.error('\n' + '='.repeat(70));
        console.error('💥 FATAL ERROR');
        console.error('='.repeat(70));
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('='.repeat(70) + '\n');
        process.exit(1);
    } finally {
        try {
            await pool.end();
            console.log('🔌 Database connection closed');
        } catch (e) {
            // Ignore
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if called directly
if (require.main === module) {
    scrapeAllPlatforms()
        .then(() => {
            console.log('👋 Scraper finished successfully');
            process.exit(0);
        })
        .catch(err => {
            console.error('💥 Scraper crashed:', err);
            process.exit(1);
        });
}

module.exports = { scrapeAllPlatforms };