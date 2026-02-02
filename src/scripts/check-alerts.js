const { initDB, DB } = require('../core/db');
const Notifications = require('../api/notifications');

async function checkPriceAlerts() {
    console.log('\n🔔 Checking Price Alerts...\n');
    
    await initDB();
    
    let alertsSent = 0;
    
    try {
        const result = await DB.query(`
            SELECT 
                w.id as watchlist_id,
                w.user_id,
                w.target_price,
                w.notify_on_any_drop,
                w.last_notified_at,
                u.fcm_token,
                u.subscription_plan,
                p.id as product_id,
                p.title,
                link.current_price,
                pl.name as platform,
                (
                    SELECT price FROM price_history 
                    WHERE link_id = link.id 
                    ORDER BY recorded_at DESC 
                    OFFSET 1 LIMIT 1
                ) as previous_price
            FROM watchlists w
            JOIN users u ON u.id = w.user_id
            JOIN products p ON p.id = w.product_id
            JOIN product_links link ON link.product_id = p.id
            JOIN platforms pl ON pl.id = link.platform_id
            WHERE u.fcm_token IS NOT NULL
            AND u.is_blocked = false
            AND (u.subscription_plan != 'free' OR w.target_price IS NOT NULL)
        `);
        
        for (const row of result.rows) {
            const { 
                watchlist_id, fcm_token, target_price, notify_on_any_drop,
                current_price, previous_price, title, product_id, platform,
                last_notified_at, subscription_plan
            } = row;
            
            if (last_notified_at) {
                const hoursSinceNotify = (Date.now() - new Date(last_notified_at)) / (1000 * 60 * 60);
                if (hoursSinceNotify < 24) continue;
            }
            
            let shouldNotify = false;
            
            if (target_price && current_price <= target_price) {
                shouldNotify = true;
            }
            
            if (!shouldNotify && notify_on_any_drop && subscription_plan !== 'free') {
                if (previous_price && current_price < previous_price) {
                    shouldNotify = true;
                }
            }
            
            if (shouldNotify) {
                const sent = await Notifications.sendPriceDropAlert(
                    fcm_token,
                    { id: product_id, title },
                    previous_price || target_price,
                    current_price,
                    platform
                );
                
                if (sent) {
                    alertsSent++;
                    await DB.query(
                        'UPDATE watchlists SET last_notified_at = NOW() WHERE id = $1',
                        [watchlist_id]
                    );
                    
                    await DB.query(`
                        INSERT INTO alert_history 
                        (user_id, product_id, old_price, new_price, platform, notification_sent)
                        VALUES ($1, $2, $3, $4, $5, true)
                    `, [row.user_id, product_id, previous_price, current_price, platform]);
                }
            }
        }
        
    } catch (e) {
        console.error('Alert Check Error:', e.message);
    }
    
    console.log(`✅ Sent ${alertsSent} price alerts\n`);
    return alertsSent;
}

if (require.main === module) {
    checkPriceAlerts().then(() => process.exit(0));
}

module.exports = { checkPriceAlerts };