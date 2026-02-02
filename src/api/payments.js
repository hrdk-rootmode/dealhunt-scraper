const Razorpay = require('razorpay');
const crypto = require('crypto');
const CONFIG = require('../config');
const { DB } = require('../core/db');

// Initialize Razorpay
let razorpay = null;

function initRazorpay() {
    if (razorpay) return razorpay;
    
    if (!CONFIG.RAZORPAY.keyId || !CONFIG.RAZORPAY.keySecret) {
        if (CONFIG.ENV !== 'test') console.log('⚠️ Razorpay credentials not configured');
        return null;
    }
    
    try {
        razorpay = new Razorpay({
            key_id: CONFIG.RAZORPAY.keyId,
            key_secret: CONFIG.RAZORPAY.keySecret
        });
        console.log('✅ Razorpay initialized');
        return razorpay;
    } catch (e) {
        console.error('❌ Razorpay init error:', e.message);
        return null;
    }
}

const Payments = {
    init: initRazorpay,
    
    // ═══════════════════════════════════════════
    // CREATE ORDER
    // ═══════════════════════════════════════════
    
    createOrder: async (userId, planName) => {
        if (!razorpay) initRazorpay();
        if (!razorpay) throw new Error('Payment gateway not configured');
        
        // Get plan details
        const planResult = await DB.query(
            'SELECT * FROM subscription_plans WHERE name = $1 AND is_active = true',
            [planName]
        );
        
        if (planResult.rows.length === 0) {
            throw new Error('Plan not found');
        }
        
        const plan = planResult.rows[0];
        
        // Create Razorpay order
        const order = await razorpay.orders.create({
            amount: plan.price_inr, // Amount in paise (100 paise = 1 INR)
            currency: 'INR',
            receipt: `order_${userId}_${Date.now()}`,
            notes: {
                user_id: userId,
                plan_id: plan.id,
                plan_name: planName
            }
        });
        
        // Save to database
        await DB.query(`
            INSERT INTO payments (user_id, razorpay_order_id, plan_id, amount, status)
            VALUES ($1, $2, $3, $4, 'pending')
        `, [userId, order.id, plan.id, plan.price_inr]);
        
        return {
            orderId: order.id,
            amount: plan.price_inr,
            currency: 'INR',
            planName: plan.display_name,
            razorpayKeyId: CONFIG.RAZORPAY.keyId
        };
    },
    
    // ═══════════════════════════════════════════
    // VERIFY PAYMENT
    // ═══════════════════════════════════════════
    
    verifyPayment: async (orderId, paymentId, signature) => {
        if (!CONFIG.RAZORPAY.keySecret) throw new Error('Payment config missing');

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', CONFIG.RAZORPAY.keySecret)
            .update(`${orderId}|${paymentId}`)
            .digest('hex');
        
        if (signature !== expectedSignature) {
            throw new Error('Invalid payment signature');
        }
        
        // Get payment record
        const paymentResult = await DB.query(
            'SELECT * FROM payments WHERE razorpay_order_id = $1',
            [orderId]
        );
        
        if (paymentResult.rows.length === 0) {
            throw new Error('Payment not found');
        }
        
        const payment = paymentResult.rows[0];
        
        // Get plan details
        const planResult = await DB.query(
            'SELECT * FROM subscription_plans WHERE id = $1',
            [payment.plan_id]
        );
        
        const plan = planResult.rows[0];
        
        // Calculate expiry date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + plan.duration_days);
        
        // Update payment and user
        await DB.query(`
            UPDATE payments 
            SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'completed'
            WHERE razorpay_order_id = $3
        `, [paymentId, signature, orderId]);
        
        await DB.query(`
            UPDATE users 
            SET subscription_plan = $1, subscription_expires_at = $2
            WHERE id = $3
        `, [plan.name, expiresAt, payment.user_id]);
        
        return {
            success: true,
            plan: plan.name,
            expiresAt
        };
    },
    
    // ═══════════════════════════════════════════
    // GET PLANS
    // ═══════════════════════════════════════════
    
    getPlans: async () => {
        const result = await DB.query(
            'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY price_inr ASC'
        );
        return result.rows;
    },
    
    // ═══════════════════════════════════════════
    // CHECK SUBSCRIPTION STATUS
    // ═══════════════════════════════════════════
    
    checkSubscription: async (userId) => {
        const result = await DB.query(`
            SELECT subscription_plan, subscription_expires_at
            FROM users WHERE id = $1
        `, [userId]);
        
        if (result.rows.length === 0) return { plan: 'free', active: true };
        
        const user = result.rows[0];
        const now = new Date();
        const expiresAt = user.subscription_expires_at;
        
        if (!expiresAt || expiresAt < now) {
            // Subscription expired, downgrade to free
            if (user.subscription_plan !== 'free') {
                await DB.query(
                    'UPDATE users SET subscription_plan = $1 WHERE id = $2',
                    ['free', userId]
                );
            }
            return { plan: 'free', active: true };
        }
        
        return {
            plan: user.subscription_plan,
            active: true,
            expiresAt
        };
    }
};

module.exports = Payments;