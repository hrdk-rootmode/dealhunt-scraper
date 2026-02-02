const admin = require('firebase-admin');
const CONFIG = require('../config');
const { DB } = require('../core/db');

// Initialize Firebase Admin
let firebaseApp = null;

function initFirebase() {
    if (firebaseApp) return firebaseApp;
    
    if (!CONFIG.FIREBASE.projectId || !CONFIG.FIREBASE.privateKey) {
        // Only log if not in test mode to avoid spam
        if (CONFIG.ENV !== 'test') console.log('⚠️ Firebase credentials not configured');
        return null;
    }
    
    try {
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert({
                projectId: CONFIG.FIREBASE.projectId,
                clientEmail: CONFIG.FIREBASE.clientEmail,
                privateKey: CONFIG.FIREBASE.privateKey
            })
        });
        console.log('✅ Firebase Admin initialized');
        return firebaseApp;
    } catch (e) {
        console.error('❌ Firebase init error:', e.message);
        return null;
    }
}

const Auth = {
    // Initialize
    init: initFirebase,
    
    // ═══════════════════════════════════════════
    // VERIFY FIREBASE TOKEN
    // ═══════════════════════════════════════════
    
    verifyToken: async (idToken) => {
        if (!firebaseApp) initFirebase();
        if (!firebaseApp) return null;
        
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            return decodedToken;
        } catch (e) {
            // console.error('Token verification failed:', e.message);
            return null;
        }
    },
    
    // ═══════════════════════════════════════════
    // CHECK IF EMAIL IS BLOCKED (Temp Mail)
    // ═══════════════════════════════════════════
    
    isEmailBlocked: async (email) => {
        if (!email) return true;
        
        const domain = email.split('@')[1]?.toLowerCase();
        if (!domain) return true;
        
        try {
            const result = await DB.query(
                'SELECT id FROM blocked_email_domains WHERE domain = $1',
                [domain]
            );
            return result.rows.length > 0;
        } catch (e) {
            console.error('Email check error:', e.message);
            return false;
        }
    },
    
    // ═══════════════════════════════════════════
    // AUTH MIDDLEWARE
    // ═══════════════════════════════════════════
    
    middleware: async (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'No token provided' });
        }
        
        const token = authHeader.split('Bearer ')[1];
        const decoded = await Auth.verifyToken(token);
        
        if (!decoded) {
            return res.status(401).json({ error: 'Invalid token' });
        }
        
        // Check if email is blocked
        if (await Auth.isEmailBlocked(decoded.email)) {
            return res.status(403).json({ error: 'Email domain not allowed' });
        }
        
        // Attach user info to request
        req.firebaseUser = decoded;
        
        // Get or create user in DB
        try {
            const user = await DB.getOrCreateUser({
                firebase_uid: decoded.uid,
                email: decoded.email,
                display_name: decoded.name,
                photo_url: decoded.picture
            });
            req.user = user;
        } catch (e) {
            console.error('User fetch error:', e.message);
        }
        
        next();
    },
    
    // ═══════════════════════════════════════════
    // OPTIONAL AUTH (Doesn't fail if no token)
    // ═══════════════════════════════════════════
    
    optionalMiddleware: async (req, res, next) => {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            const decoded = await Auth.verifyToken(token);
            
            if (decoded) {
                req.firebaseUser = decoded;
                try {
                    req.user = await DB.getOrCreateUser({
                        firebase_uid: decoded.uid,
                        email: decoded.email,
                        display_name: decoded.name,
                        photo_url: decoded.picture
                    });
                } catch (e) {}
            }
        }
        
        next();
    },
    
    // ═══════════════════════════════════════════
    // ADMIN AUTH MIDDLEWARE
    // ═══════════════════════════════════════════
    
    adminMiddleware: async (req, res, next) => {
        const adminSecret = req.headers['x-admin-secret'];
        
        // Method 1: Secret Key
        if (adminSecret === CONFIG.ADMIN_SECRET) {
            return next();
        }
        
        // Method 2: Firebase Auth (Check if user is admin in DB)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split('Bearer ')[1];
            const decoded = await Auth.verifyToken(token);
            
            if (decoded) {
                try {
                    const adminRes = await DB.query(
                        'SELECT id FROM admins WHERE email = $1 AND is_active = true',
                        [decoded.email]
                    );
                    
                    if (adminRes.rows.length > 0) {
                        req.admin = adminRes.rows[0];
                        return next();
                    }
                } catch (e) {}
            }
        }
        
        return res.status(403).json({ error: 'Admin access required' });
    }
};

module.exports = Auth;