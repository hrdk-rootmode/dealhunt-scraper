-- ═══════════════════════════════════════════════
-- DEALHUNT V3.0 DATABASE SCHEMA
-- Complete Commercial Schema
-- ═══════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════
-- CORE TABLES
-- ═══════════════════════════════════════════════

-- PLATFORMS
CREATE TABLE IF NOT EXISTS platforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    affiliate_tag VARCHAR(100),
    selectors JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PRODUCTS (Master Catalog)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fingerprint VARCHAR(255) UNIQUE NOT NULL,
    title TEXT NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    image_url TEXT,
    specifications JSONB DEFAULT '{}'::jsonb,
    ai_tags TEXT[],
    ai_processed BOOLEAN DEFAULT false,
    views_count INTEGER DEFAULT 0,
    watch_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PRODUCT LINKS (Platform-Specific)
CREATE TABLE IF NOT EXISTS product_links (
    id SERIAL PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    platform_id INTEGER REFERENCES platforms(id) ON DELETE CASCADE,
    external_id VARCHAR(100) NOT NULL,
    product_url TEXT,
    affiliate_url TEXT,
    current_price DECIMAL(10, 2),
    original_price DECIMAL(10, 2),
    discount_percent INTEGER DEFAULT 0,
    rating DECIMAL(2, 1) DEFAULT 0,
    review_count INTEGER DEFAULT 0,
    in_stock BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT true,
    last_scraped TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(platform_id, external_id)
);

-- PRICE HISTORY
CREATE TABLE IF NOT EXISTS price_history (
    id SERIAL PRIMARY KEY,
    link_id INTEGER REFERENCES product_links(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- USER & AUTH TABLES
-- ═══════════════════════════════════════════════

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(128) UNIQUE,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    photo_url TEXT,
    fcm_token TEXT,
    hardware_id VARCHAR(255),
    subscription_plan VARCHAR(20) DEFAULT 'free',
    subscription_expires_at TIMESTAMP,
    daily_search_count INTEGER DEFAULT 0,
    last_search_reset DATE DEFAULT CURRENT_DATE,
    is_blocked BOOLEAN DEFAULT false,
    block_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- BLOCKED EMAILS
CREATE TABLE IF NOT EXISTS blocked_email_domains (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- WISHLIST & ALERTS
-- ═══════════════════════════════════════════════

-- WATCHLISTS
CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    target_price DECIMAL(10, 2),
    notify_on_any_drop BOOLEAN DEFAULT false,
    is_notified BOOLEAN DEFAULT false,
    last_notified_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- ALERT HISTORY
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    old_price DECIMAL(10, 2),
    new_price DECIMAL(10, 2),
    platform VARCHAR(50),
    notification_sent BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- SUBSCRIPTION & PAYMENTS
-- ═══════════════════════════════════════════════

-- SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    price_inr INTEGER NOT NULL,
    duration_days INTEGER NOT NULL,
    daily_searches INTEGER DEFAULT -1,
    wishlist_limit INTEGER DEFAULT -1,
    features JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PAYMENT HISTORY
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    plan_id INTEGER REFERENCES subscription_plans(id),
    amount INTEGER NOT NULL,
    currency VARCHAR(10) DEFAULT 'INR',
    status VARCHAR(20) DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- ADMIN & LOGGING
-- ═══════════════════════════════════════════════

-- ADMIN USERS
CREATE TABLE IF NOT EXISTS admins (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),
    name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'admin',
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- APP CONFIG
CREATE TABLE IF NOT EXISTS app_config (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- DAILY LOGS
CREATE TABLE IF NOT EXISTS daily_logs (
    id SERIAL PRIMARY KEY,
    run_date DATE UNIQUE NOT NULL,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'pending',
    trending_detected JSONB DEFAULT '[]'::jsonb,
    platforms_scraped JSONB DEFAULT '{}'::jsonb,
    total_products_found INTEGER DEFAULT 0,
    total_products_saved INTEGER DEFAULT 0,
    total_products_updated INTEGER DEFAULT 0,
    ai_processed INTEGER DEFAULT 0,
    alerts_sent INTEGER DEFAULT 0,
    errors JSONB DEFAULT '[]'::jsonb,
    duration_seconds INTEGER DEFAULT 0,
    github_committed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SCRAPE SESSIONS
CREATE TABLE IF NOT EXISTS scrape_sessions (
    id SERIAL PRIMARY KEY,
    daily_log_id INTEGER REFERENCES daily_logs(id) ON DELETE CASCADE,
    platform VARCHAR(50) NOT NULL,
    category VARCHAR(100),
    query VARCHAR(255),
    products_found INTEGER DEFAULT 0,
    products_saved INTEGER DEFAULT 0,
    products_updated INTEGER DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'running',
    error_message TEXT,
    healed_selectors JSONB DEFAULT '[]'::jsonb
);

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_products_fingerprint ON products(fingerprint);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_views ON products(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_links_product ON product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_links_platform ON product_links(platform_id);
CREATE INDEX IF NOT EXISTS idx_price_history_link ON price_history(link_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase ON users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_product ON watchlists(product_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(run_date);

-- ═══════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════

INSERT INTO platforms (name, base_url, affiliate_tag, is_active) VALUES 
    ('amazon', 'https://www.amazon.in', 'dealhunt-21', true),
    ('flipkart', 'https://www.flipkart.com', 'affiliate123', true),
    ('croma', 'https://www.croma.com', 'croma_aff', false),
    ('myntra', 'https://www.myntra.com', 'myntra_aff', false)
ON CONFLICT (name) DO UPDATE SET affiliate_tag = EXCLUDED.affiliate_tag;

INSERT INTO subscription_plans (name, display_name, price_inr, duration_days, daily_searches, wishlist_limit, features) VALUES
    ('free', 'Free', 0, 0, 10, 5, '{"ads": true, "comparison": true, "alerts": false}'::jsonb),
    ('pro', 'Pro', 4900, 30, 100, 50, '{"ads": false, "comparison": true, "alerts": true}'::jsonb),
    ('premium', 'Premium', 14900, 30, -1, -1, '{"ads": false, "comparison": true, "alerts": true, "priority_support": true}'::jsonb)
ON CONFLICT (name) DO UPDATE SET 
    price_inr = EXCLUDED.price_inr,
    daily_searches = EXCLUDED.daily_searches,
    wishlist_limit = EXCLUDED.wishlist_limit;

INSERT INTO blocked_email_domains (domain) VALUES
    ('tempmail.com'), ('throwaway.com'), ('guerrillamail.com'),
    ('10minutemail.com'), ('mailinator.com'), ('yopmail.com')
ON CONFLICT (domain) DO NOTHING;

INSERT INTO app_config (key, value, description) VALUES
    ('maintenance_mode', 'false', 'Enable maintenance mode'),
    ('min_app_version', '1.0.0', 'Minimum supported app version'),
    ('force_update', 'false', 'Force users to update app')
ON CONFLICT (key) DO NOTHING;