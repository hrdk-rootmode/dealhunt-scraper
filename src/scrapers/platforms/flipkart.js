// src/scrapers/platforms/flipkart.js
const BaseScraper = require('../core/base-scraper');
const Product = require('../../models/Products');
const cheerio = require('cheerio');

class FlipkartScraper extends BaseScraper {
  constructor() {
    super({
      platformName: 'Flipkart',
      baseURL: 'https://www.flipkart.com'
    });
  }

  getSearchURL(category, page) {
    return `${this.baseURL}/search?q=${encodeURIComponent(category)}&page=${page}`;
  }

  getHeaders() {
    return {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'max-age=0',
      'Sec-Ch-Ua': '"Chromium";v="122", "Google Chrome";v="122"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Upgrade-Insecure-Requests': '1'
    };
  }

  isBlocked(html) {
    // Flipkart pages are ~600KB, only block if really small or captcha-only
    if (!html || html.length < 50000) return true;
    if (html.length < 100000 && html.toLowerCase().includes('captcha')) return true;
    return false;
  }

  // ========== EXTRACT PRODUCT DATA (Using Analyzed Classes) ==========
  async extractProductData($, el) {
    try {
      const $card = $(el);

      // === PRODUCT ID (from data-id attribute) ===
      const productId = $card.attr('data-id');
      if (!productId) return null;

      // === TITLE (from product link text or title attribute) ===
      let title = null;
      const $link = $card.find('a[href*="/p/"]').first();
      
      if ($link.length) {
        // Try title attribute first
        title = $link.attr('title');
        
        // If no title attribute, extract from text (remove "Add to Compare" prefix)
        if (!title) {
          const fullText = $link.text().trim();
          // Pattern: "Add to Compare{ProductName}4.3XX,XXX Ratings..."
          // Extract product name between "Compare" and rating pattern
          const match = fullText.match(/Add to Compare(.+?)(?:\d\.\d|\d+ GB RAM)/i);
          if (match) {
            title = match[1].trim();
          } else {
            // Fallback: take first substantial part
            const parts = fullText.split(/\d\.\d/);
            if (parts[0]) {
              title = parts[0].replace(/Add to Compare/i, '').trim();
            }
          }
        }
      }

      if (!title || title.length < 10) return null;

      // === PRICES ===
      // Current price: .hZ3P6w (most common)
      let currentPrice = null;
      const currentPriceSelectors = [
        'div.hZ3P6w.DeU9vF',
        'div.hZ3P6w.KTtanE', 
        'div.hZ3P6w'
      ];
      
      for (const sel of currentPriceSelectors) {
        const priceText = $card.find(sel).first().text().trim();
        if (priceText) {
          currentPrice = parseFloat(priceText.replace(/[₹,]/g, ''));
          if (currentPrice > 0) break;
        }
      }

      if (!currentPrice || isNaN(currentPrice)) return null;

      // Original price: .kRYCnD
      let originalPrice = currentPrice;
      const origPriceText = $card.find('div.kRYCnD').first().text().trim();
      if (origPriceText) {
        const parsed = parseFloat(origPriceText.replace(/[₹,]/g, ''));
        if (parsed > currentPrice) originalPrice = parsed;
      }

      // === DISCOUNT ===
      let discountPercent = 0;
      if (originalPrice > currentPrice) {
        discountPercent = Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
      }

      // Try to find discount badge
      const cardText = $card.text();
      const discountMatch = cardText.match(/(\d+)%\s*off/i);
      if (discountMatch && discountPercent === 0) {
        discountPercent = parseInt(discountMatch[1]);
        // Recalculate original if we have discount but prices were same
        if (originalPrice === currentPrice) {
          originalPrice = Math.round(currentPrice / (1 - discountPercent / 100));
        }
      }

      // === RATING & REVIEWS (from card text) ===
      let rating = null;
      let reviewCount = 0;

      // Pattern: "4.343,218 Ratings & 1,404 Reviews"
      // Extract rating (before the ratings count)
      const ratingMatch = cardText.match(/(\d\.\d)(\d{1,3}(?:,\d{3})*)\s*Ratings?/i);
      if (ratingMatch) {
        rating = parseFloat(ratingMatch[1]);
        reviewCount = parseInt(ratingMatch[2].replace(/,/g, ''));
      } else {
        // Fallback: just look for standalone rating
        const simpleRatingMatch = cardText.match(/(?:^|\s)(\d\.\d)(?:\s|★)/);
        if (simpleRatingMatch) {
          rating = parseFloat(simpleRatingMatch[1]);
          if (rating < 1 || rating > 5) rating = null;
        }
        
        // Fallback: just look for review count
        const reviewMatch = cardText.match(/([\d,]+)\s*Ratings?/i);
        if (reviewMatch) {
          reviewCount = parseInt(reviewMatch[1].replace(/,/g, ''));
        }
      }

      // Handle K/L suffix
      const reviewKMatch = cardText.match(/([\d.]+)\s*[Kk]\s*Ratings?/i);
      if (reviewKMatch && reviewCount === 0) {
        reviewCount = Math.round(parseFloat(reviewKMatch[1]) * 1000);
      }

      // === IMAGE ===
      let imageUrl = null;
      const $img = $card.find('img').first();
      if ($img.length) {
        imageUrl = $img.attr('src');
        if (imageUrl) {
          // Upgrade to higher resolution
          imageUrl = imageUrl.replace(/\/\d+\/\d+\//g, '/416/416/');
        }
      }

      // === PRODUCT URL ===
      let productUrl = null;
      if ($link.length) {
        productUrl = $link.attr('href');
        if (productUrl && !productUrl.startsWith('http')) {
          productUrl = this.baseURL + productUrl;
        }
        // Clean tracking params
        if (productUrl) {
          productUrl = productUrl.split('&lid=')[0];
        }
      }
      if (!productUrl) {
        productUrl = `${this.baseURL}/product?pid=${productId}`;
      }

      // === BRAND ===
      let brand = 'Unknown';
      const brandList = [
        'Samsung', 'Apple', 'iPhone', 'Xiaomi', 'Redmi', 'POCO', 'OnePlus', 
        'Realme', 'realme', 'Oppo', 'Vivo', 'Nokia', 'Motorola', 'Moto',
        'Google', 'Pixel', 'Nothing', 'iQOO', 'Tecno', 'Infinix', 'Lava', 
        'Honor', 'Asus', 'Sony', 'Huawei', 'Ai+'
      ];
      
      for (const b of brandList) {
        if (title.toLowerCase().includes(b.toLowerCase())) {
          brand = b === 'iPhone' ? 'Apple' : b;
          brand = b === 'realme' ? 'Realme' : brand;
          break;
        }
      }

      if (brand === 'Unknown') {
        const firstWord = title.split(/[\s(]/)[0];
        if (/^[A-Za-z+]+$/.test(firstWord)) brand = firstWord;
      }

      // === SPECIFICATIONS ===
      const specifications = this.extractSpecsFromTitle(title);

      // === BUILD PRODUCT ===
      return this.validateProduct({
        product_id: productId,
        title,
        brand,
        category: 'Smartphones',
        subcategory: 'Mobile Phones',
        image_url: imageUrl,
        product_url: productUrl,
        current_price: currentPrice,
        original_price: originalPrice,
        discount_percent: discountPercent,
        is_available: true,
        rating,
        review_count: reviewCount,
        specifications
      });

    } catch (error) {
      return null;
    }
  }

  // ========== SCRAPE PAGE ==========
  async scrapePage(page, attempt = 1) {
    const maxAttempts = 3;
    const url = this.getSearchURL('smartphones', page);
    
    console.log(`\n📄 [${this.platformName}] Page ${page} (attempt ${attempt}/${maxAttempts})`);
    
    try {
      const res = await this.client.get(url, { headers: this.getHeaders() });

      if (this.isBlocked(res.data)) {
        throw new Error('BLOCKED');
      }

      console.log(`   📦 Response: ${res.data.length.toLocaleString()} bytes`);

      const $ = cheerio.load(res.data);
      
      // Find product cards using data-id attribute
      const cards = $('div[data-id]').filter((i, el) => {
        const $el = $(el);
        // Must have a product link
        return $el.find('a[href*="/p/"]').length > 0;
      });

      console.log(`   🔍 Found ${cards.length} product cards`);

      if (cards.length === 0) {
        console.log('   ⚠️ No product cards found');
        return [];
      }

      const products = [];
      const seenIds = new Set();

      for (let i = 0; i < cards.length; i++) {
        const p = await this.extractProductData($, cards[i]);
        if (p && !seenIds.has(p.product_id)) {
          seenIds.add(p.product_id);
          products.push(p);
        }
      }

      console.log(`✅ [${this.platformName}] Page ${page}: ${products.length} valid products`);
      
      if (products.length > 0) {
        const withRating = products.filter(p => p.rating).length;
        const withReviews = products.filter(p => p.review_count > 0).length;
        const withSpecs = products.filter(p => Object.keys(p.specifications).length >= 3).length;
        const avgQuality = Math.round(products.reduce((sum, p) => sum + p.quality_score, 0) / products.length);

        console.log(`   📊 Quality: ${withRating}/${products.length} rated, ${withReviews}/${products.length} reviewed, ${withSpecs}/${products.length} specs, avg ${avgQuality}/100`);
        
        // Show sample
        const sample = products[0];
        console.log(`   📱 Sample: ${sample.title.substring(0, 45)}... @ ₹${sample.current_price.toLocaleString()}`);
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
    if (!platformId) {
      console.error('❌ Flipkart not found in platforms table');
      return { scraped: 0, new: 0, updated: 0 };
    }

    let page = 1;
    let allProducts = [];
    let emptyPages = 0;

    while (allProducts.length < maxProducts && page <= 10 && emptyPages < 2) {
      const pageProducts = await this.scrapePage(page);
      
      if (pageProducts.length === 0) {
        emptyPages++;
      } else {
        emptyPages = 0;
        
        // Deduplicate
        for (const p of pageProducts) {
          if (!allProducts.some(x => x.product_id === p.product_id)) {
            allProducts.push(p);
          }
        }
      }
      
      if (allProducts.length >= maxProducts) {
        allProducts = allProducts.slice(0, maxProducts);
        break;
      }

      page++;
      await this.delay(4000, 7000);
    }

    if (allProducts.length === 0) {
      console.warn('⚠️ [Flipkart] No products scraped');
      return { scraped: 0, new: 0, updated: 0 };
    }

    console.log(`\n💾 [${this.platformName}] Saving ${allProducts.length} products...\n`);

    const stats = { scraped: 0, new: 0, updated: 0, withRating: 0, withReviews: 0, avgQuality: 0 };

    for (const product of allProducts) {
      try {
        product.platform_id = platformId;
        const result = await Product.upsert(product);
        
        stats.scraped++;
        if (result.isNew) stats.new++;
        else stats.updated++;
        
        if (product.rating) stats.withRating++;
        if (product.review_count > 0) stats.withReviews++;
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

    stats.avgQuality = Math.round(stats.avgQuality / (stats.scraped || 1));

    console.log(`\n✅ [${this.platformName}] Results:`);
    console.log(`   Saved: ${stats.scraped} (${stats.new} new, ${stats.updated} updated)`);
    console.log(`   Quality: ${stats.withRating}/${stats.scraped} rated, ${stats.withReviews}/${stats.scraped} reviewed`);
    console.log(`   Avg score: ${stats.avgQuality}/100`);

    return stats;
  }
}

module.exports = FlipkartScraper;