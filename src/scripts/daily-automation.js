const Scraper = require('../core/scraper');
const AI = require('../core/ai');
const { initDB, DB } = require('../core/db');
const GitHubBackup = require('./github-backup');
const { checkPriceAlerts } = require('./check-alerts');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════
// PLATFORM-SPECIFIC CATEGORY MAPPING
// ═══════════════════════════════════════════════

const PLATFORM_CATEGORIES = {
    amazon: {
        electronics: ['smartphones', 'laptops', 'headphones', 'tablets', 'smart watches', 'cameras'],
        fashion: ['mens tshirts', 'womens dresses', 'shoes', 'watches'],
        home: ['home decor', 'kitchen appliances'],
        deals: ['todays deals', 'best sellers', 'new launches']
    },
    flipkart: {
        electronics: ['mobiles', 'laptops', 'headphones', 'tablets', 'smartwatches'],
        fashion: ['mens clothing', 'womens clothing', 'footwear'],
        home: ['home furnishing', 'kitchen appliances'],
        deals: ['offers of the day', 'top deals', 'new arrivals']
    }
};

// ═══════════════════════════════════════════════
// DETECT TRENDING (Based on Day/Season)
// ═══════════════════════════════════════════════

function detectTrending() {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const month = now.getMonth();
    const date = now.getDate();
    
    const trending = [];
    
    // Weekend = Fashion focus
    if (dayOfWeek === 0 || dayOfWeek === 6) {
        trending.push('fashion', 'footwear', 'casual wear');
    }
    
    // Weekday = Electronics focus
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        trending.push('smartphones', 'laptops', 'headphones');
    }
    
    // Monthly patterns
    if (date <= 5) {
        trending.push('deals', 'offers'); // Start of month = Salary time
    }
    
    // Seasonal
    if (month >= 3 && month <= 5) {
        trending.push('summer sale', 'cooling appliances'); // Summer
    }
    if (month >= 9 && month <= 10) {
        trending.push('festive sale', 'diwali offers', 'gift items'); // Festival
    }
    if (month === 11 || month === 0) {
        trending.push('winter wear', 'new year sale'); // Winter
    }
    
    return [...new Set(trending)]; // Remove duplicates
}

// ═══════════════════════════════════════════════
// GET QUERIES FOR PLATFORM
// ═══════════════════════════════════════════════

function getQueriesForPlatform(platform, trendingCategories) {
    const categories = PLATFORM_CATEGORIES[platform];
    if (!categories) return [];
    
    const queries = [];
    
    // Always include electronics (most profitable)
    if (categories.electronics) {
        queries.push(...categories.electronics.slice(0, 4));
    }
    
    // Add trending based on detection
    for (const trend of trendingCategories) {
        if (trend.includes('fashion') && categories.fashion) {
            queries.push(...categories.fashion.slice(0, 2));
        }
        if (trend.includes('deal') || trend.includes('offer')) {
            if (categories.deals) queries.push(...categories.deals.slice(0, 2));
        }
    }
    
    return [...new Set(queries)]; // Remove duplicates
}

// ═══════════════════════════════════════════════
// MAIN AUTOMATION FUNCTION
// ═══════════════════════════════════════════════

async function runDailyAutomation() {
    const startTime = Date.now();
    const today = new Date().toISOString().split('T')[0];
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         🌙 DEALHUNT NIGHTLY AUTOMATION                 ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\n📅 Date: ${today}`);
    console.log(`⏰ Time: ${new Date().toLocaleTimeString('en-IN')}\n`);
    
    await initDB();
    
    // Create daily log
    const logId = await DB.createDailyLog(today);
    
    const results = {
        trending: [],
        platforms: {},
        found: 0,
        saved: 0,
        updated: 0,
        aiProcessed: 0,
        alertsSent: 0,
        errors: []
    };
    
    try {
        // ═══════════════════════════════════════
        // PHASE 1: DETECT TRENDING
        // ═══════════════════════════════════════
        
        console.log('═'.repeat(60));
        console.log('🔥 PHASE 1: DETECTING TRENDING CATEGORIES');
        console.log('═'.repeat(60) + '\n');
        
        const trendingCategories = detectTrending();
        results.trending = trendingCategories;
        
        console.log('   Trending today:');
        trendingCategories.forEach(t => console.log(`   • ${t}`));
        
        // Update trending file
        const trendingData = {
            lastUpdated: new Date().toISOString(),
            trending: trendingCategories,
            platformCategories: PLATFORM_CATEGORIES
        };
        
        await GitHubBackup.backupTrending(trendingData);
        
        // ═══════════════════════════════════════
        // PHASE 2: SMART SCRAPING
        // ═══════════════════════════════════════
        
        console.log('\n' + '═'.repeat(60));
        console.log('📦 PHASE 2: SMART SCRAPING');
        console.log('═'.repeat(60));
        
        const platforms = Scraper.getAvailable();
        const limitPerQuery = 30;
        
        for (const platform of platforms) {
            console.log(`\n🏪 ${platform.toUpperCase()}`);
            console.log('-'.repeat(40));
            
            results.platforms[platform] = { found: 0, saved: 0, updated: 0, queries: [] };
            
            const queries = getQueriesForPlatform(platform, trendingCategories);
            
            for (const query of queries) {
                console.log(`   🔍 "${query}"...`);
                
                const sessionId = await DB.createScrapeSession(logId, platform, query);
                
                try {
                    const result = await Scraper.run(platform, query, limitPerQuery);
                    
                    if (result.skipped) {
                        console.log(`      ⏭️ Skipped`);
                        await DB.updateScrapeSession(sessionId, { status: 'skipped' });
                        continue;
                    }
                    
                    const saved = result.saved || 0;
                    const updated = result.duplicates || 0; // Fixed: Use 'duplicates' from DB.bulkUpsertProducts
                    const found = result.found || 0;
                    
                    console.log(`      ✅ Found: ${found}, Saved: ${saved}, Updated: ${updated}`);
                    
                    results.platforms[platform].found += found;
                    results.platforms[platform].saved += saved;
                    results.platforms[platform].updated += updated;
                    results.platforms[platform].queries.push(query);
                    
                    results.found += found;
                    results.saved += saved;
                    results.updated += updated;
                    
                    await DB.updateScrapeSession(sessionId, {
                        found, saved, updated,
                        status: 'completed',
                        category: query
                    });
                    
                    // Delay between queries
                    await new Promise(r => setTimeout(r, 3000));
                    
                } catch (e) {
                    console.log(`      ❌ ${e.message}`);
                    results.errors.push({ platform, query, error: e.message });
                    
                    await DB.updateScrapeSession(sessionId, {
                        status: 'failed',
                        error: e.message
                    });
                }
            }
            
            // Delay between platforms
            await new Promise(r => setTimeout(r, 5000));
        }
        
        // ═══════════════════════════════════════
        // PHASE 3: AI PROCESSING
        // ═══════════════════════════════════════
        
        console.log('\n' + '═'.repeat(60));
        console.log('🧠 PHASE 3: AI CATEGORIZATION');
        console.log('═'.repeat(60) + '\n');
        
        results.aiProcessed = await AI.processQueue(500);
        console.log(`   ✅ Processed: ${results.aiProcessed} products`);
        
        // ═══════════════════════════════════════
        // PHASE 4: PRICE ALERTS (NEW STEP)
        // ═══════════════════════════════════════
        
        console.log('\n' + '═'.repeat(60));
        console.log('🔔 PHASE 4: CHECKING PRICE ALERTS');
        console.log('═'.repeat(60) + '\n');
        
        results.alertsSent = await checkPriceAlerts();
        
        // ═══════════════════════════════════════
        // PHASE 5: GITHUB BACKUP
        // ═══════════════════════════════════════
        
        console.log('\n' + '═'.repeat(60));
        console.log('💾 PHASE 5: GITHUB BACKUP');
        console.log('═'.repeat(60) + '\n');
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        
        const dailyLogData = {
            date: today,
            startedAt: new Date(startTime).toISOString(),
            completedAt: new Date().toISOString(),
            duration: `${Math.floor(duration / 60)}m ${duration % 60}s`,
            summary: {
                totalFound: results.found,
                totalSaved: results.saved,
                totalUpdated: results.updated,
                aiProcessed: results.aiProcessed,
                alertsSent: results.alertsSent
            },
            trending: results.trending,
            platforms: results.platforms,
            errors: results.errors
        };
        
        const githubSuccess = await GitHubBackup.backupDailyLog(today, dailyLogData);
        results.githubCommitted = githubSuccess;
        
        // Final DB Update
        await DB.updateDailyLog(logId, {
            status: 'completed',
            trending: results.trending,
            platforms: results.platforms,
            found: results.found,
            saved: results.saved,
            updated: results.updated,
            aiProcessed: results.aiProcessed,
            alertsSent: results.alertsSent,
            errors: results.errors,
            duration: duration,
            githubCommitted: githubSuccess
        });
        
    } catch (e) {
        console.error('\n❌ AUTOMATION ERROR:', e.message);
        results.errors.push({ phase: 'main', error: e.message });
        
        await DB.updateDailyLog(logId, {
            status: 'failed',
            errors: results.errors,
            duration: Math.round((Date.now() - startTime) / 1000)
        });
    }
    
    // ═══════════════════════════════════════
    // FINAL REPORT
    // ═══════════════════════════════════════
    
    const stats = await DB.getStats();
    const duration = Math.round((Date.now() - startTime) / 1000);
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║              📊 NIGHTLY REPORT                         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log(`   📅 Date:              ${today}`);
    console.log(`   🔥 Trending:          ${results.trending.join(', ')}`);
    console.log(`   📦 Products Found:    ${results.found}`);
    console.log(`   🆕 New Saved:         ${results.saved}`);
    console.log(`   🔄 Updated:           ${results.updated}`);
    console.log(`   🧠 AI Processed:      ${results.aiProcessed}`);
    console.log(`   🔔 Alerts Sent:       ${results.alertsSent}`);
    console.log(`   📊 Total in DB:       ${stats.products}`);
    console.log(`   ⏱️  Duration:          ${Math.floor(duration / 60)}m ${duration % 60}s`);
    console.log(`   💾 GitHub Backup:     ${results.githubCommitted ? '✅' : '❌'}`);
    
    if (results.errors.length > 0) {
        console.log(`   ⚠️  Errors:            ${results.errors.length}`);
    }
    
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         ✅ NIGHTLY AUTOMATION COMPLETE!                ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    process.exit(0);
}

// Run if called directly
if (require.main === module) {
    runDailyAutomation().catch(e => {
        console.error('❌ Fatal:', e.message);
        process.exit(1);
    });
}

module.exports = { runDailyAutomation };