const { Pool } = require('pg');
const CONFIG = require('../config');

async function syncPlatforms() {
    const pool = new Pool({ 
        connectionString: CONFIG.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    try {
        console.log('🔄 Syncing platforms.json to Database...\n');
        
        const platforms = CONFIG.PLATFORMS;
        let synced = 0;
        
        for (const [name, config] of Object.entries(platforms)) {
            await pool.query(`
                INSERT INTO platforms (name, base_url, selectors, is_active)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (name) DO UPDATE SET
                    base_url = EXCLUDED.base_url,
                    selectors = EXCLUDED.selectors,
                    is_active = EXCLUDED.is_active
            `, [name, config.base_url, config.selectors, config.isActive]);
            
            console.log(`✅ Synced: ${name}`);
            synced++;
        }
        
        console.log(`\n✅ Successfully synced ${synced} platforms`);
        
    } catch (e) {
        console.error('❌ Sync Failed:', e.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

syncPlatforms();