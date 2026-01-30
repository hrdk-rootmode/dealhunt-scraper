/**
 * ============================================================
 * DEALHUNT CENTRAL CONFIGURATION
 * ============================================================
 * All settings in ONE file for easy management.
 * Modify values here to change scraping behavior.
 * ============================================================
 */

module.exports = {

  // ========== SCRAPING GOALS ==========
  
  targets: {
    daily_total: 2000,           // Products to scrape per day
    week2_goal: 14000,           // 7 days × 2000
    month1_goal: 50000,          // Ultimate target
  },

  // ========== PLATFORM CONFIGURATION ==========
  
  platforms: {
    amazon: {
      enabled: true,
      name: 'Amazon',
      baseURL: 'https://www.amazon.in',
      daily_quota: 800,          // Products per day
      rate_limit_ms: 4000,       // Delay between requests (4 seconds)
      max_pages: 10,             // Max pages per category
      priority: 1,               // Higher = scraped first
    },
    
    flipkart: {
      enabled: true,
      name: 'Flipkart',
      baseURL: 'https://www.flipkart.com',
      daily_quota: 800,
      rate_limit_ms: 3000,
      max_pages: 10,
      priority: 2,
    },
    
    myntra: {
      enabled: false,            // Enable when ready
      name: 'Myntra',
      baseURL: 'https://www.myntra.com',
      daily_quota: 400,
      rate_limit_ms: 3000,
      max_pages: 8,
      priority: 3,
      note: 'Fashion only - requires JavaScript rendering',
    },
    
    croma: {
      enabled: false,
      name: 'Croma',
      baseURL: 'https://www.croma.com',
      daily_quota: 200,
      rate_limit_ms: 3000,
      max_pages: 5,
      priority: 4,
      note: 'Electronics specialist',
    },
  },

  // ========== CATEGORY CONFIGURATION ==========
  
  categories: {
    // HIGH PRIORITY (60% of daily quota)
    smartphones: {
      enabled: true,
      daily_quota: 320,
      search_terms: {
        amazon: 'smartphones',
        flipkart: 'mobiles',
        myntra: null,            // Not applicable
      },
      priority: 1,
    },
    
    laptops: {
      enabled: true,
      daily_quota: 160,
      search_terms: {
        amazon: 'laptops',
        flipkart: 'laptops',
        myntra: null,
      },
      priority: 2,
    },
    
    fashion_men: {
      enabled: true,
      daily_quota: 280,
      search_terms: {
        amazon: 'mens+fashion',
        flipkart: 'mens+clothing',
        myntra: 'men-clothing',
      },
      priority: 3,
    },
    
    fashion_women: {
      enabled: true,
      daily_quota: 280,
      search_terms: {
        amazon: 'womens+fashion',
        flipkart: 'womens+clothing',
        myntra: 'women-clothing',
      },
      priority: 4,
    },
    
    home_appliances: {
      enabled: true,
      daily_quota: 160,
      search_terms: {
        amazon: 'home+appliances',
        flipkart: 'home+appliances',
        myntra: null,
      },
      priority: 5,
    },
    
    // MEDIUM PRIORITY (30% of daily quota)
    headphones: {
      enabled: true,
      daily_quota: 120,
      search_terms: {
        amazon: 'headphones',
        flipkart: 'headphones',
        myntra: null,
      },
      priority: 6,
    },
    
    watches: {
      enabled: true,
      daily_quota: 120,
      search_terms: {
        amazon: 'watches',
        flipkart: 'watches',
        myntra: 'watches',
      },
      priority: 7,
    },
    
    tablets: {
      enabled: true,
      daily_quota: 80,
      search_terms: {
        amazon: 'tablets',
        flipkart: 'tablets',
        myntra: null,
      },
      priority: 8,
    },
    
    beauty: {
      enabled: true,
      daily_quota: 160,
      search_terms: {
        amazon: 'beauty+products',
        flipkart: 'beauty',
        myntra: 'beauty',
      },
      priority: 9,
    },
    
    books: {
      enabled: false,            // Enable later
      daily_quota: 120,
      search_terms: {
        amazon: 'books',
        flipkart: 'books',
        myntra: null,
      },
      priority: 10,
    },
    
    // LOW PRIORITY (10% of daily quota)
    cameras: {
      enabled: false,
      daily_quota: 80,
      search_terms: {
        amazon: 'cameras',
        flipkart: 'cameras',
        myntra: null,
      },
      priority: 11,
    },
    
    furniture: {
      enabled: false,
      daily_quota: 80,
      search_terms: {
        amazon: 'furniture',
        flipkart: 'furniture',
        myntra: null,
      },
      priority: 12,
    },
  },

  // ========== FESTIVAL CALENDAR (INDIA) ==========
  
  festivals: {
    diwali_2026: {
      name: 'Diwali Sale',
      start_date: '2026-10-15',
      end_date: '2026-11-10',
      multiplier: 2.5,           // 2.5x normal scraping
      boost_categories: ['smartphones', 'laptops', 'home_appliances', 'fashion_men', 'fashion_women'],
    },
    
    holi_2026: {
      name: 'Holi Sale',
      start_date: '2026-03-01',
      end_date: '2026-03-15',
      multiplier: 1.5,
      boost_categories: ['fashion_men', 'fashion_women', 'beauty'],
    },
    
    independence_day_2026: {
      name: 'Independence Day Sale',
      start_date: '2026-08-10',
      end_date: '2026-08-20',
      multiplier: 2.0,
      boost_categories: ['smartphones', 'laptops', 'headphones'],
    },
    
    republic_day_2026: {
      name: 'Republic Day Sale',
      start_date: '2026-01-20',
      end_date: '2026-01-30',
      multiplier: 2.0,
      boost_categories: ['smartphones', 'laptops', 'home_appliances'],
    },
    
    big_billion_days: {
      name: 'Big Billion Days (Flipkart)',
      start_date: '2026-09-25',
      end_date: '2026-10-05',
      multiplier: 3.0,
      boost_categories: ['smartphones', 'laptops', 'fashion_men', 'fashion_women', 'home_appliances'],
      platforms: ['flipkart'],   // Flipkart specific
    },
    
    amazon_great_indian: {
      name: 'Great Indian Festival (Amazon)',
      start_date: '2026-09-25',
      end_date: '2026-10-05',
      multiplier: 3.0,
      boost_categories: ['smartphones', 'laptops', 'fashion_men', 'fashion_women', 'home_appliances'],
      platforms: ['amazon'],     // Amazon specific
    },
  },

  // ========== DATA RETENTION RULES (TTL) ==========
  
  retention: {
    price_history_days: 180,     // Delete price history older than 180 days
    scrape_logs_days: 90,        // Delete logs older than 90 days
    inactive_product_days: 180,  // Archive products not updated in 180 days
    
    // Products to NEVER delete (even if old)
    protected_conditions: [
      'in_user_watchlist',       // User is watching this product
      'searched_last_30_days',   // Someone searched for it recently
      'high_price_volatility',   // Price changed >10% (useful data)
    ],
  },

  // ========== AI PROCESSING SETTINGS ==========
  
  ai: {
    provider: 'groq',
    model: 'llama-3.3-70b-versatile',
    batch_size: 5,               // Products per API call
    daily_limit: 14400,          // Groq free tier limit
    target_usage: 400,           // Conservative daily usage
    retry_attempts: 3,
    timeout_ms: 15000,
  },

  // ========== SCRAPING SCHEDULE ==========
  
  schedule: {
    timezone: 'Asia/Kolkata',
    
    // Daily Jobs (IST times)
    database_cleanup: '01:00',   // 1:00 AM - Delete old data
    amazon_scraping: '02:00',    // 2:00 AM - Scrape Amazon
    flipkart_scraping: '02:55',  // 2:55 AM - Scrape Flipkart
    myntra_scraping: '03:50',    // 3:50 AM - Scrape Myntra (when enabled)
    ai_processing: '04:25',      // 4:25 AM - Run AI categorization
    cache_refresh: '04:30',      // 4:30 AM - Refresh Redis cache
    
    // Cron expressions (UTC for Render)
    cron: {
      cleanup: '30 19 * * *',    // 1:00 AM IST = 7:30 PM UTC prev day
      amazon: '30 20 * * *',     // 2:00 AM IST = 8:30 PM UTC prev day
      flipkart: '25 21 * * *',   // 2:55 AM IST
      ai: '55 22 * * *',         // 4:25 AM IST
    },
  },

  // ========== STORAGE LIMITS ==========
  
  storage: {
    max_database_mb: 900,        // Alert at 900 MB (1 GB limit)
    warning_threshold_mb: 800,   // Warning at 800 MB
    max_products: 60000,         // Hard limit on products
    max_price_history_per_product: 365,  // Max price records per product
  },

  // ========== QUALITY THRESHOLDS ==========
  
  quality: {
    min_quality_score: 30,       // Reject products below this
    target_rating_percent: 90,   // Target: 90% products with rating
    target_review_percent: 85,   // Target: 85% products with reviews
    target_specs_percent: 70,    // Target: 70% products with 3+ specs
  },

  // ========== HELPER FUNCTIONS ==========
  
  // Check if currently in a festival period
  isInFestival() {
    const today = new Date().toISOString().split('T')[0];
    
    for (const [key, festival] of Object.entries(this.festivals)) {
      if (today >= festival.start_date && today <= festival.end_date) {
        return { active: true, festival: key, ...festival };
      }
    }
    
    return { active: false };
  },

  // Get today's scraping quota (adjusted for festivals)
  getTodayQuota(categoryKey) {
    const category = this.categories[categoryKey];
    if (!category || !category.enabled) return 0;
    
    const festival = this.isInFestival();
    
    if (festival.active && festival.boost_categories.includes(categoryKey)) {
      return Math.round(category.daily_quota * festival.multiplier);
    }
    
    return category.daily_quota;
  },

  // Get all enabled platforms
  getEnabledPlatforms() {
    return Object.entries(this.platforms)
      .filter(([key, config]) => config.enabled)
      .map(([key, config]) => ({ key, ...config }))
      .sort((a, b) => a.priority - b.priority);
  },

  // Get all enabled categories
  getEnabledCategories() {
    return Object.entries(this.categories)
      .filter(([key, config]) => config.enabled)
      .map(([key, config]) => ({ key, ...config }))
      .sort((a, b) => a.priority - b.priority);
  },

  // Get search term for platform + category
  getSearchTerm(platformKey, categoryKey) {
    const category = this.categories[categoryKey];
    if (!category) return null;
    return category.search_terms[platformKey] || null;
  },

  // Calculate total daily quota
  getTotalDailyQuota() {
    let total = 0;
    for (const [key, category] of Object.entries(this.categories)) {
      if (category.enabled) {
        total += this.getTodayQuota(key);
      }
    }
    return total;
  },

  // Print current configuration summary
  printSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 DEALHUNT CONFIGURATION SUMMARY');
    console.log('═'.repeat(60));
    
    const platforms = this.getEnabledPlatforms();
    console.log(`\n🏪 Platforms (${platforms.length} enabled):`);
    platforms.forEach(p => {
      console.log(`   ✅ ${p.name}: ${p.daily_quota} products/day`);
    });
    
    const categories = this.getEnabledCategories();
    console.log(`\n📁 Categories (${categories.length} enabled):`);
    categories.forEach(c => {
      console.log(`   ✅ ${c.key}: ${this.getTodayQuota(c.key)} products/day`);
    });
    
    const festival = this.isInFestival();
    if (festival.active) {
      console.log(`\n🎉 FESTIVAL ACTIVE: ${festival.name} (${festival.multiplier}x boost)`);
    }
    
    console.log(`\n📈 Today's Total Quota: ${this.getTotalDailyQuota()} products`);
    console.log('═'.repeat(60) + '\n');
  },
};