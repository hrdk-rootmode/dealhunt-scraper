const admin = require('firebase-admin');
const CONFIG = require('../config');

const Notifications = {
    // ═══════════════════════════════════════════
    // SEND PUSH NOTIFICATION
    // ═══════════════════════════════════════════
    
    send: async (fcmToken, title, body, data = {}) => {
        if (!fcmToken) return false;
        
        try {
            // Ensure Firebase is initialized (Auth module handles init)
            const messaging = admin.messaging();
            
            const message = {
                token: fcmToken,
                notification: {
                    title,
                    body
                },
                data: {
                    ...data,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK'
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        channelId: 'price_alerts'
                    }
                },
                apns: {
                    payload: {
                        aps: {
                            sound: 'default',
                            badge: 1
                        }
                    }
                }
            };
            
            await messaging.send(message);
            console.log(`📱 Notification sent: ${title}`);
            return true;
            
        } catch (e) {
            // console.error('Push notification error:', e.message);
            return false;
        }
    },
    
    // ═══════════════════════════════════════════
    // SEND PRICE DROP ALERT
    // ═══════════════════════════════════════════
    
    sendPriceDropAlert: async (fcmToken, product, oldPrice, newPrice, platform) => {
        const savings = Math.round(oldPrice - newPrice);
        const percentOff = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
        
        return await Notifications.send(
            fcmToken,
            `🔥 Price Drop Alert!`,
            `${product.title.substring(0, 50)}... is now ₹${newPrice} (${percentOff}% off)`,
            {
                type: 'price_drop',
                product_id: product.id,
                platform,
                old_price: oldPrice.toString(),
                new_price: newPrice.toString(),
                savings: savings.toString()
            }
        );
    },
    
    // ═══════════════════════════════════════════
    // SEND TO MULTIPLE USERS
    // ═══════════════════════════════════════════
    
    sendToMultiple: async (fcmTokens, title, body, data = {}) => {
        if (!fcmTokens || fcmTokens.length === 0) return { success: 0, failed: 0 };
        
        let success = 0;
        let failed = 0;
        
        for (const token of fcmTokens) {
            const sent = await Notifications.send(token, title, body, data);
            if (sent) success++;
            else failed++;
        }
        
        return { success, failed };
    }
};

module.exports = Notifications;