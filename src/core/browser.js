const CONFIG = require('../config');

let puppeteer = null;
let browser = null;

async function getBrowser() {
    if (!CONFIG.USE_BROWSER) {
        throw new Error('Browser mode disabled. Set USE_BROWSER=true');
    }
    
    if (!puppeteer) {
        try {
            puppeteer = require('puppeteer-core');
        } catch (e) {
            console.log('Puppeteer not found, browser mode disabled');
        }
    }
    
    if (!browser) {
        browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
        });
        console.log('🌐 Puppeteer Launched');
    }
    
    return browser;
}

const Browser = {
    fetchHTML: async (url) => {
        const browser = await getBrowser();
        const page = await browser.newPage();
        
        try {
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
            await page.goto(url, { waitUntil: 'networkidle2', timeout: CONFIG.TIMEOUT });
            await page.waitForTimeout(2000);
            return await page.content();
        } finally {
            await page.close();
        }
    },
    
    close: async () => {
        if (browser) {
            await browser.close();
            browser = null;
        }
    }
};

process.on('SIGINT', async () => {
    await Browser.close();
    process.exit(0);
});

module.exports = Browser;