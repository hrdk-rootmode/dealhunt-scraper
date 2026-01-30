const axios = require('axios');
const cheerio = require('cheerio');
const Product = require('../models/Products');
const { cache } = require('../config/redis');
const https = require('https');

class AmazonScraper {
  constructor() {
    this.baseURL = 'https://www.amazon.in';
    this.platformName = 'Amazon';

    this.userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];

    this.client = axios.create({
      timeout: 25000,
      maxRedirects: 5,
      httpsAgent: new https.Agent({ keepAlive: true }),
      validateStatus: status => status < 500
    });
  }

  getRandomUserAgent() {
    return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
  }

  getHeaders() {
    return {
      'User-Agent': this.getRandomUserAgent(),
      'Accept':
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-IN,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate', // ❗ NO br
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Referer': 'https://www.amazon.in/',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Dest': 'document',
      'Cache-Control': 'no-cache',
    };
  }

  async delay(min = 4000, max = 9000) {
    const ms = Math.floor(Math.random() * (max - min)) + min;
    console.log(`⏳ Waiting ${(ms / 1000).toFixed(1)}s`);
    await new Promise(r => setTimeout(r, ms));
  }

  isBlocked(html) {
    return (
      html.includes('Enter the characters you see below') ||
      html.includes('/errors/validateCaptcha') ||
      html.length < 20000 // real Amazon pages are BIG
    );
  }

  extractProductData($, el) {
    const asin = $(el).attr('data-asin');
    if (!asin) return null;

    const title = $(el).find('h2 span').first().text().trim();
    if (!title) return null;

    const priceWhole = $(el).find('.a-price-whole').first().text();
    if (!priceWhole) return null;

    const priceFraction = $(el).find('.a-price-fraction').first().text() || '00';
    const price = parseFloat(`${priceWhole.replace(/[₹,]/g, '')}.${priceFraction}`);

    const image = $(el).find('img.s-image').attr('src');
    const href = $(el).find('h2 a').attr('href');
    
    // ✅ FIX: Always generate product URL from ASIN if href is missing
    const product_url = href 
      ? this.baseURL + href.split('?')[0]
      : `${this.baseURL}/dp/${asin}`; // Fallback to direct product page

    return {
      product_id: asin,
      title,
      brand: title.split(' ')[0],
      category: 'Smartphones',
      subcategory: 'Mobile Phones',
      image_url: image || `https://m.media-amazon.com/images/I/placeholder.jpg`, // Fallback image
      product_url: product_url, // ✅ Now always has a value
      current_price: price,
      original_price: price,
      discount_percent: 0,
      is_available: true,
      rating: null,
      review_count: 0,
      specifications: {}
    };
  }

  async scrapePage(page) {
    const url = `${this.baseURL}/s?k=smartphones&page=${page}`;
    console.log(`📄 Scraping page ${page}`);

    const res = await this.client.get(url, { headers: this.getHeaders() });

    if (!res.data || this.isBlocked(res.data)) {
      console.error('❌ Blocked by Amazon');
      return [];
    }

    const $ = cheerio.load(res.data);
    const products = [];

    $('[data-component-type="s-search-result"]').each((_, el) => {
      const p = this.extractProductData($, el);
      if (p) products.push(p);
    });

    console.log(`✅ Found ${products.length} products`);
    return products;
  }

  async scrape({ maxProducts = 20 } = {}) {
    console.log('\n🚀 Starting Amazon Scraper');

    const platformId = await Product.getPlatformId(this.platformName);
    if (!platformId) throw new Error('Platform not found');

    let page = 1;
    let results = [];

    while (results.length < maxProducts && page <= 3) {
      const pageProducts = await this.scrapePage(page);
      if (pageProducts.length === 0) break;

      results.push(...pageProducts);
      await this.delay();
      page++;
    }

    if (results.length === 0) {
      throw new Error('Amazon blocked scraping completely');
    }

    results = results.slice(0, maxProducts);

    for (const p of results) {
      p.platform_id = platformId;
      await Product.upsert(p);
    }

    console.log(`🎉 Scraped ${results.length} products`);
    return results.length;
  }
}

module.exports = AmazonScraper;
