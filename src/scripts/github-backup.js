const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

const GitHubBackup = {
    
    // ═══════════════════════════════════════════
    // COMMIT FILE TO GITHUB
    // ═══════════════════════════════════════════
    
    commitFile: async (filePath, content, message) => {
        if (!GITHUB_TOKEN || !GITHUB_REPO) {
            console.log('   ⚠️ GitHub credentials not set. Saving locally only.');
            return GitHubBackup.saveLocally(filePath, content);
        }
        
        try {
            const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`;
            
            // Check if file exists
            let sha = null;
            try {
                const existing = await axios.get(apiUrl, {
                    headers: { Authorization: `Bearer ${GITHUB_TOKEN}` }
                });
                sha = existing.data.sha;
            } catch (e) {
                // File doesn't exist, that's OK
            }
            
            // Commit
            const response = await axios.put(apiUrl, {
                message: message,
                content: Buffer.from(JSON.stringify(content, null, 2)).toString('base64'),
                branch: GITHUB_BRANCH,
                sha: sha
            }, {
                headers: {
                    Authorization: `Bearer ${GITHUB_TOKEN}`,
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`   ✅ GitHub: ${filePath} committed`);
            return true;
            
        } catch (e) {
            console.error(`   ❌ GitHub Error: ${e.response?.data?.message || e.message}`);
            return GitHubBackup.saveLocally(filePath, content);
        }
    },
    
    // ═══════════════════════════════════════════
    // SAVE LOCALLY (Fallback)
    // ═══════════════════════════════════════════
    
    saveLocally: (filePath, content) => {
        try {
            const fullPath = path.join(process.cwd(), filePath);
            const dir = path.dirname(fullPath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            fs.writeFileSync(fullPath, JSON.stringify(content, null, 2));
            console.log(`   💾 Saved locally: ${filePath}`);
            return true;
        } catch (e) {
            console.error(`   ❌ Local Save Error: ${e.message}`);
            return false;
        }
    },
    
    // ═══════════════════════════════════════════
    // BACKUP DAILY LOG
    // ═══════════════════════════════════════════
    
    backupDailyLog: async (date, logData) => {
        const filePath = `data/daily-logs/${date}.json`;
        const message = `📊 Daily log: ${date}`;
        return await GitHubBackup.commitFile(filePath, logData, message);
    },
    
    // ═══════════════════════════════════════════
    // BACKUP TRENDING CATEGORIES
    // ═══════════════════════════════════════════
    
    backupTrending: async (trendingData) => {
        const filePath = 'data/trending/categories.json';
        const message = `🔥 Trending update: ${new Date().toISOString().split('T')[0]}`;
        return await GitHubBackup.commitFile(filePath, trendingData, message);
    },
    
    // ═══════════════════════════════════════════
    // BACKUP MONTHLY DATA
    // ═══════════════════════════════════════════
    
    backupMonthlyProducts: async (yearMonth, products) => {
        const filePath = `data/monthly-backups/${yearMonth}-products.json`;
        const message = `📦 Monthly backup: ${yearMonth} products`;
        return await GitHubBackup.commitFile(filePath, products, message);
    },
    
    backupMonthlyPrices: async (yearMonth, prices) => {
        const filePath = `data/monthly-backups/${yearMonth}-prices.json`;
        const message = `💰 Monthly backup: ${yearMonth} prices`;
        return await GitHubBackup.commitFile(filePath, prices, message);
    }
};

module.exports = GitHubBackup;