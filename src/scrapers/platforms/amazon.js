// src/scrapers/platforms/amazon.js
const BaseScraper = require('../core/base-scraper');
const Product = require('../../models/Products');
const cheerio = require('cheerio');

class AmazonScraper extends BaseScraper {
  constructor() {
    super({
      platformName: 'Amazon',
      baseURL: 'https://www.amazon.in'
    });
  }

  getSearchURL(category, page) {
    return `${this.baseURL}/s?k=${category}&page=${page}`;
  }

  // ========== ENHANCED EXTRACTION (FROM YOUR OLD CODE) ==========

  async extractProductData($, el) {
    try {
      const $product = $(el);
      const asin = $product.attr('data-asin');
      if (!asin) return null;

      // TITLE
      const title = await this.smartExtract($, $product, 'title', ($el) => {
        const text = $el.first().text().trim();
        return text.length > 10 ? text : null;
      });
      
      if (!title) {
        console.warn(`⚠️  Could not extract title for ASIN ${asin}`);
        return null;
      }

      // CURRENT PRICE
      const currentPrice = await this.smartExtract($, $product, 'current_price', ($el) => {
        const priceWhole = $el.first().text().replace(/[,₹]/g, '');
        const priceFraction = $product.find('.a-price-fraction').first().text() || '00';
        const price = parseFloat(`${priceWhole}.${priceFraction}`);
        return (price > 0 && price < 10000000) ? price : null;
      });

      if (!currentPrice) {
        console.warn(`⚠️  Could not extract price for ${title.substring(0, 30)}...`);
        return null;
      }

      // ORIGINAL PRICE
      let originalPrice = await this.smartExtract($, $product, 'original_price', ($el) => {
        const priceText = $el.first().text().replace(/[₹,]/g, '');
        const price = parseFloat(priceText);
        return (price > 0 && price < 10000000) ? price : null;
      });

      if (!originalPrice || originalPrice < currentPrice) {
        originalPrice = currentPrice;
      }

      // DISCOUNT
      let discountPercent = 0;
      if (originalPrice > currentPrice) {
        discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      }

      // DISCOUNT BADGE VALIDATION
      const discountBadge = $product.find('.s-coupon-highlight-color, .a-color-price').text();
      const badgeMatch = discountBadge.match(/(\d+)%\s*off/i);
      if (badgeMatch) {
        const badgeDiscount = parseInt(badgeMatch[1]);
        if (badgeDiscount > 0 && discountPercent === 0) {
          discountPercent = badgeDiscount;
          originalPrice = Math.round(currentPrice / (1 - badgeDiscount / 100));
        }
      }

      // RATING
      const rating = await this.smartExtract($, $product, 'rating', ($el) => {
        let ratingText = $el.first().text();
        let match = ratingText.match(/(\d+\.?\d*)\s*out of/i);
        if (match) {
          const r = parseFloat(match[1]);
          return (r >= 0 && r <= 5) ? r : null;
        }
        const ariaLabel = $el.attr('aria-label') || '';
        match = ariaLabel.match(/(\d+\.?\d*)/);
        if (match) {
          const r = parseFloat(match[1]);
          return (r >= 0 && r <= 5) ? r : null;
        }
        return null;
      });

      // REVIEW COUNT
      const reviewCount = await this.smartExtract($, $product, 'review_count', ($el) => {
        const reviewText = $el.first().text().trim();
        let match = reviewText.match(/([\d,]+)\s*rating/i);
        if (match) return parseInt(match[1].replace(/,/g, ''));
        match = reviewText.match(/([\d.]+)K/i);
        if (match) return Math.round(parseFloat(match[1]) * 1000);
        match = reviewText.match(/([\d.]+)M/i);
        if (match) return Math.round(parseFloat(match[1]) * 1000000);
        match = reviewText.match(/([\d,]+)/);
        if (match) return parseInt(match[1].replace(/,/g, ''));
        return 0;
      }, 0);

      // IMAGE
      const imageUrl = await this.smartExtract($, $product, 'image', ($el) => {
        let src = $el.attr('src');
        if (src) {
          src = src.replace(/\._[A-Z]{2,3}\d+_\./, '.');
          return src;
        }
        return null;
      });

      // PRODUCT URL
      const productUrl = await this.smartExtract($, $product, 'product_url', ($el) => {
        const href = $el.attr('href');
        return href ? this.baseURL + href.split('?')[0] : null;
      }) || `${this.baseURL}/dp/${asin}`;

      // SPECIFICATIONS
      const specifications = this.extractSpecsFromTitle(title);
      
      // BRAND
      let brand = title.split(' ')[0];
      if (!/^[A-Za-z0-9]+$/.test(brand)) {
        const brandMatch = title.match(/^([A-Za-z0-9]+)/);
        brand = brandMatch ? brandMatch[1] : 'Unknown';
      }

      // BUILD PRODUCT
      const product = {
        product_id: asin,
        title: title,
        brand: brand,
        category: 'Smartphones',
        subcategory: 'Mobile Phones',
        image_url: imageUrl,
        product_url: productUrl,
        current_price: currentPrice,
        original_price: originalPrice,
        discount_percent: discountPercent,
        is_available: true,
        rating: rating,
        review_count: reviewCount,
        specifications: specifications
      };

      return this.validateProduct(product);

    } catch (error) {
      console.error('❌ Error extracting product:', error.message);
      return null;
    }
  }

  // ========== SCRAPING PAGES ==========

  async scrapePage(page, attempt = 1) {
    const maxAttempts = 3;
    const url = this.getSearchURL('smartphones', page);
    
    console.log(`\n📄 [${this.platformName}] Page ${page} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      const res = await this.client.get(url, { headers: this.getHeaders() });

      if (!res.data || this.isBlocked(res.data)) {
        throw new Error('BLOCKED');
      }

      const $ = cheerio.load(res.data);
      const products = [];
      const productCards = $('[data-component-type="s-search-result"]');

      console.log(`   Found ${productCards.length} product cards`);

      for (let i = 0; i < productCards.length; i++) {
        const p = await this.extractProductData($, productCards[i]);
        if (p) products.push(p);
      }

      console.log(`✅ [${this.platformName}] Page ${page}: ${products.length} valid products`);
      
      if (products.length > 0) {
        const withRating = products.filter(p => p.rating).length;
        const withReviews = products.filter(p => p.review_count > 0).length;
        const withSpecs = products.filter(p => Object.keys(p.specifications).length >= 3).length;
        const avgQuality = Math.round(products.reduce((sum, p) => sum + p.quality_score, 0) / products.length);

        console.log(`   📊 Quality: ${withRating}/${products.length} rated, ${withReviews}/${products.length} reviewed, ${withSpecs}/${products.length} specs, avg ${avgQuality}/100`);
      }

      return products;

    } catch (error) {
      console.error(`❌ [${this.platformName}] Page ${page} error: ${error.message}`);

      if (attempt < maxAttempts) {
        const waitTime = attempt * 5000;
        console.log(`🔄 Retrying in ${waitTime / 1000}s...`);
        await new Promise(r => setTimeout(r, waitTime));
        return this.scrapePage(page, attempt + 1);
      }

      return [];
    }
  }

  // ========== MAIN SCRAPE METHOD ==========

  async scrape({ maxProducts = 20 } = {}) {
    console.log(`\n🚀 [${this.platformName}] Starting scraper (target: ${maxProducts})`);

    const platformId = await Product.getPlatformId(this.platformName);
    if (!platformId) throw new Error('Platform not found in database');

    let page = 1;
    let allProducts = [];

    while (allProducts.length < maxProducts && page <= 10) {
      const pageProducts = await this.scrapePage(page);
      if (pageProducts.length === 0) break;

      allProducts.push(...pageProducts);
      
      if (allProducts.length >= maxProducts) {
        allProducts = allProducts.slice(0, maxProducts);
        break;
      }

      page++;
      await this.delay(4000, 7000);
    }

    if (allProducts.length === 0) {
      throw new Error(`[${this.platformName}] No products scraped`);
    }

    console.log(`\n💾 [${this.platformName}] Saving ${allProducts.length} products...\n`);

    const stats = { scraped: 0, new: 0, updated: 0, withRating: 0, withReviews: 0, withSpecs: 0, avgQuality: 0 };

    for (const product of allProducts) {
      try {
        product.platform_id = platformId;
        const result = await Product.upsert(product);
        
        stats.scraped++;
        if (result.isNew) stats.new++;
        else stats.updated++;
        
        if (product.rating) stats.withRating++;
        if (product.review_count > 0) stats.withReviews++;
        if (Object.keys(product.specifications).length >= 3) stats.withSpecs++;
        stats.avgQuality += product.quality_score;

        console.log(`${result.isNew ? '➕ NEW' : '🔄 UPDATE'}: ${product.title.substring(0, 60)}...`);
        console.log(`   💰 ₹${product.current_price.toLocaleString()} (${product.discount_percent}% off) | ⭐ ${product.rating || 'N/A'} (${product.review_count.toLocaleString()} reviews)`);
        console.log(`   📋 ${Object.keys(product.specifications).length} specs | 📊 Quality: ${product.quality_score}/100\n`);

        await Product.addPriceHistory(result.id, {
          current_price: product.current_price,
          original_price: product.original_price,
          discount_percent: product.discount_percent,
          is_available: product.is_available
        });

      } catch (error) {
        console.error(`❌ Error saving product: ${error.message}`);
      }
    }

    stats.avgQuality = Math.round(stats.avgQuality / stats.scraped);

    console.log(`\n✅ [${this.platformName}] Results:`);
    console.log(`   Saved: ${stats.scraped} (${stats.new} new, ${stats.updated} updated)`);
    console.log(`   Quality: ${stats.withRating}/${stats.scraped} rated, ${stats.withReviews}/${stats.scraped} reviewed`);
    console.log(`   Avg score: ${stats.avgQuality}/100`);

    return stats;
  }
}

module.exports = AmazonScraper;