// src/scrapers/core/base-scraper.js
const axios = require('axios');
const cheerio = require('cheerio');
const https = require('https');
const SelectorHealer = require('../selector-healer');

class BaseScraper {
  constructor(config) {
    this.platformName = config.platformName;
    this.baseURL = config.baseURL;
    this.userAgents = config.userAgents || this.getDefaultUserAgents();
    
    this.client = axios.create({
      timeout: 30000,
      maxRedirects: 5,
      httpsAgent: new https.Agent({ 
        keepAlive: true,
        rejectUnauthorized: true
      }),
      validateStatus: status => status < 500
    });

    // Initialize AI healer
    this.healer = null;
    this.patterns = null;
    this.healingCooldowns = {}; // Rate limit AI healing
    
    if (process.env.GROQ_API_KEY) {
      this.healer = new SelectorHealer(process.env.GROQ_API_KEY);
      this.initializeHealer();
    }
  }

  async initializeHealer() {
    try {
      this.patterns = await this.healer.loadPatterns();
      console.log(`✅ AI Healer initialized for ${this.platformName}`);
    } catch (error) {
      console.warn(`⚠️ AI Healer failed to initialize for ${this.platformName}`);
    }
  }

  getDefaultUserAgents() {
    return [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
    ];
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  getHeaders() {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': this.baseURL,
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
    };
  }

  async delay(min = 4000, max = 9000) {
    const ms = Math.floor(Math.random() * (max - min)) + min;
    console.log(`⏳ Waiting ${(ms / 1000).toFixed(1)}s`);
    await new Promise(r => setTimeout(r, ms));
  }

  isBlocked(html) {
    const blockPatterns = [
      'Enter the characters you see below',
      '/errors/validateCaptcha',
      'Robot Check',
      'Please verify you are a human',
      'Access Denied',
      'unusual traffic'
    ];
    return blockPatterns.some(pattern => html.includes(pattern)) || html.length < 10000;
  }

  // Check if we should attempt healing (rate limiting)
  canHeal(fieldName) {
    const key = `${this.platformName}_${fieldName}`;
    const now = Date.now();
    const lastAttempt = this.healingCooldowns[key] || 0;
    const cooldownMs = 30000; // 30 seconds between healing attempts per field
    
    if (now - lastAttempt < cooldownMs) {
      return false;
    }
    
    this.healingCooldowns[key] = now;
    return true;
  }

  // Smart extraction with AI fallback and rate limiting
  async smartExtract($, element, fieldName, extractFn, fallbackValue = null) {
    const platform = this.platformName.toLowerCase();
    const selectors = this.patterns?.[platform]?.patterns?.[fieldName]?.selectors || [];

    // Try each selector
    for (let i = 0; i < selectors.length; i++) {
      const selector = selectors[i];
      try {
        const $el = $(element).find(selector);
        if ($el.length > 0) {
          const result = extractFn($el);
          if (result !== null && result !== undefined && result !== '' && !Number.isNaN(result)) {
            // Update confidence on success
            if (this.healer && i === 0) {
              await this.healer.updateConfidence(platform, fieldName, selector, true);
            }
            return result;
          }
        }
      } catch (error) {
        // Try next selector
      }
    }

    // AI healing with rate limiting
    if (this.healer && this.canHeal(fieldName)) {
      try {
        console.log(`\n🔧 Healing ${fieldName} selector for ${platform}...`);
        const newSelector = await this.healer.healSelector(platform, fieldName, $, element);
        
        if (newSelector) {
          const $el = $(element).find(newSelector);
          if ($el.length > 0) {
            const result = extractFn($el);
            if (result !== null && result !== undefined && result !== '' && !Number.isNaN(result)) {
              console.log(`✅ AI healed ${fieldName} successfully!`);
              this.patterns = await this.healer.loadPatterns();
              return result;
            }
          }
        }
      } catch (error) {
        // Healing failed, use fallback
        if (error.message?.includes('429')) {
          console.log(`⚠️ Rate limited, using fallback for ${fieldName}`);
        }
      }
    }

    return fallbackValue;
  }

  // Extract specifications from title (common across platforms)
  extractSpecsFromTitle(title) {
    const specs = {};

    try {
      // RAM
      const ramMatch = title.match(/(\d+)\s*GB\s*RAM/i);
      if (ramMatch) specs.ram = ramMatch[1] + 'GB';

      // Storage
      const storageMatch = title.match(/(\d+)\s*GB(?!\s*RAM)/i);
      if (storageMatch) specs.storage = storageMatch[1] + 'GB';
      
      const tbMatch = title.match(/(\d+)\s*TB/i);
      if (tbMatch) specs.storage = tbMatch[1] + 'TB';

      // Display
      const displayMatch = title.match(/(\d+\.?\d*)\s*(?:inch|")/i);
      if (displayMatch) specs.display_size = displayMatch[1] + ' inch';

      // Battery
      const batteryMatch = title.match(/(\d+)\s*mAh/i);
      if (batteryMatch) specs.battery = batteryMatch[1] + 'mAh';

      // Connectivity
      if (/5G/i.test(title)) specs.connectivity = '5G';
      else if (/4G|LTE/i.test(title)) specs.connectivity = '4G';

      // Camera
      const cameraMatch = title.match(/(\d+)\s*MP/i);
      if (cameraMatch) specs.camera = cameraMatch[1] + 'MP';

      // Processor
      const processorMatch = title.match(/(Snapdragon|MediaTek|Dimensity|Exynos|Helio|A\d+\s*Bionic)[\s\w]*/i);
      if (processorMatch) specs.processor = processorMatch[0].trim().substring(0, 50);

      // OS
      if (/Android/i.test(title)) {
        const androidMatch = title.match(/Android\s*(\d+)/i);
        specs.os = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
      } else if (/iOS|iPhone/i.test(title)) {
        specs.os = 'iOS';
      }

      // Refresh rate
      const refreshMatch = title.match(/(\d+)\s*Hz/i);
      if (refreshMatch) specs.refresh_rate = refreshMatch[1] + 'Hz';

      // Fast charging
      const chargingMatch = title.match(/(\d+)\s*W/i);
      if (chargingMatch) specs.fast_charging = chargingMatch[1] + 'W';

      // Color (common colors)
      const colorMatch = title.match(/\b(Black|White|Blue|Green|Red|Gold|Silver|Purple|Pink|Grey|Gray|Orange|Yellow|Titanium|Bronze)\b/i);
      if (colorMatch) specs.color = colorMatch[1];

    } catch (error) {
      // Ignore spec extraction errors
    }

    return specs;
  }

  // Validate product data
  validateProduct(product) {
    // ========== PRICE VALIDATION ==========
    if (isNaN(product.current_price) || product.current_price === null || product.current_price <= 0) {
      return null;
    }

    if (isNaN(product.original_price) || product.original_price === null || product.original_price < 0) {
      product.original_price = product.current_price;
    }

    if (product.original_price < product.current_price) {
      [product.original_price, product.current_price] = [product.current_price, product.original_price];
      product.discount_percent = Math.round(
        ((product.original_price - product.current_price) / product.original_price) * 100
      );
    }

    // ========== DISCOUNT VALIDATION ==========
    if (isNaN(product.discount_percent) || product.discount_percent === null) {
      product.discount_percent = 0;
    }
    if (product.discount_percent < 0) product.discount_percent = 0;
    if (product.discount_percent > 95) product.discount_percent = 95;

    // ========== RATING VALIDATION ==========
    if (product.rating !== null && (isNaN(product.rating) || product.rating < 0 || product.rating > 5)) {
      product.rating = null;
    }

    // ========== REVIEW COUNT VALIDATION ==========
    if (isNaN(product.review_count) || product.review_count === null || product.review_count < 0) {
      product.review_count = 0;
    }
    if (product.review_count > 1000000) product.review_count = 999999;

    // ========== SPECIFICATIONS VALIDATION ==========
    if (!product.specifications || typeof product.specifications !== 'object') {
      product.specifications = {};
    }

    // ========== QUALITY SCORING ==========
    product.quality_score = this.calculateQualityScore(product);

    if (product.quality_score < 30) {
      return null;
    }

    return product;
  }

  calculateQualityScore(product) {
    let score = 100;
    if (!product.rating) score -= 15;
    if (product.review_count === 0) score -= 10;
    if (!product.specifications || Object.keys(product.specifications).length === 0) score -= 20;
    if (Object.keys(product.specifications).length < 3) score -= 10;
    if (product.discount_percent === 0) score -= 5;
    if (!product.image_url) score -= 10;
    if (product.title.length < 20) score -= 10;
    return Math.max(0, score);
  }

  // Abstract methods
  async extractProductData($, element) {
    throw new Error(`${this.platformName} must implement extractProductData()`);
  }

  getSearchURL(category, page) {
    throw new Error(`${this.platformName} must implement getSearchURL()`);
  }
}

module.exports = BaseScraper;