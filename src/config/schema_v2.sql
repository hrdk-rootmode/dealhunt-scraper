-- ═══════════════════════════════════════════════
-- DEALHUNT V3.0 DATABASE SCHEMA
-- Complete with Logging & Analytics Tables
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

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(128) UNIQUE,
    email VARCHAR(255) UNIQUE,
    fcm_token TEXT,
    hardware_id VARCHAR(255),
    daily_search_count INTEGER DEFAULT 0,
    last_reset_date DATE DEFAULT CURRENT_DATE,
    is_premium BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WATCHLISTS
CREATE TABLE IF NOT EXISTS watchlists (
    id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    target_price DECIMAL(10, 2),
    is_notified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
);

-- ═══════════════════════════════════════════════
-- LOGGING & ANALYTICS TABLES (NEW)
-- ═══════════════════════════════════════════════

-- DAILY LOGS (Track each automation run)
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
    errors JSONB DEFAULT '[]'::jsonb,
    duration_seconds INTEGER DEFAULT 0,
    github_committed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- SCRAPE SESSIONS (Track individual scrapes)
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

-- TRENDING HISTORY (Track trending over time)
CREATE TABLE IF NOT EXISTS trending_history (
    id SERIAL PRIMARY KEY,
    recorded_date DATE NOT NULL,
    platform VARCHAR(50),
    category VARCHAR(100),
    trending_score INTEGER DEFAULT 0,
    product_count INTEGER DEFAULT 0,
    avg_discount DECIMAL(5, 2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_products_fingerprint ON products(fingerprint);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_views ON products(views_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_ai_processed ON products(ai_processed);
CREATE INDEX IF NOT EXISTS idx_products_created ON products(created_at);
CREATE INDEX IF NOT EXISTS idx_links_product ON product_links(product_id);
CREATE INDEX IF NOT EXISTS idx_links_platform ON product_links(platform_id);
CREATE INDEX IF NOT EXISTS idx_links_verified ON product_links(is_verified);
CREATE INDEX IF NOT EXISTS idx_links_scraped ON product_links(last_scraped);
CREATE INDEX IF NOT EXISTS idx_price_history_link ON price_history(link_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlists(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_logs_date ON daily_logs(run_date);
CREATE INDEX IF NOT EXISTS idx_scrape_sessions_daily ON scrape_sessions(daily_log_id);
CREATE INDEX IF NOT EXISTS idx_trending_date ON trending_history(recorded_date);

-- ═══════════════════════════════════════════════
-- SEED PLATFORMS
-- ═══════════════════════════════════════════════

INSERT INTO platforms (name, base_url, is_active) VALUES 
    ('amazon', 'https://www.amazon.in', true),
    ('flipkart', 'https://www.flipkart.com', true),
    ('croma', 'https://www.croma.com', false),
    ('myntra', 'https://www.myntra.com', false)
ON CONFLICT (name) DO NOTHING;