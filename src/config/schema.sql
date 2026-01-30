-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Platforms table
CREATE TABLE platforms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    base_url VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert supported platforms
INSERT INTO platforms (name, base_url) VALUES
    ('Amazon', 'https://www.amazon.in'),
    ('Flipkart', 'https://www.flipkart.com'),
    ('Myntra', 'https://www.myntra.com'),
    ('Ajio', 'https://www.ajio.com');

-- Products table (master)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id VARCHAR(100) UNIQUE NOT NULL,
    platform_id INTEGER REFERENCES platforms(id),
    title TEXT NOT NULL,
    brand VARCHAR(100),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    image_url TEXT,
    product_url TEXT NOT NULL,
    
    current_price DECIMAL(10, 2),
    original_price DECIMAL(10, 2),
    discount_percent INTEGER,
    is_available BOOLEAN DEFAULT true,
    
    rating DECIMAL(2, 1),
    review_count INTEGER,
    specifications JSONB,
    
    ai_category VARCHAR(100),
    ai_tags TEXT[],
    ai_processed BOOLEAN DEFAULT false,
    
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    scrape_count INTEGER DEFAULT 1,
    
    CONSTRAINT valid_rating CHECK (rating >= 0 AND rating <= 5),
    CONSTRAINT valid_discount CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

-- Price history table
CREATE TABLE price_history (
    id SERIAL PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    price DECIMAL(10, 2) NOT NULL,
    original_price DECIMAL(10, 2),
    discount_percent INTEGER,
    is_available BOOLEAN DEFAULT true,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Scraping logs
CREATE TABLE scrape_logs (
    id SERIAL PRIMARY KEY,
    platform_id INTEGER REFERENCES platforms(id),
    status VARCHAR(20),
    products_scraped INTEGER DEFAULT 0,
    products_new INTEGER DEFAULT 0,
    products_updated INTEGER DEFAULT 0,
    errors TEXT,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER
);

-- Indexes for performance
CREATE INDEX idx_products_platform ON products(platform_id);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_brand ON products(brand);
CREATE INDEX idx_products_price ON products(current_price);
CREATE INDEX idx_products_updated ON products(last_updated DESC);
CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);
CREATE INDEX idx_scrape_logs_platform ON scrape_logs(platform_id, started_at DESC);

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_last_updated()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for products table
CREATE TRIGGER update_products_timestamp
    BEFORE UPDATE ON products
    FOR EACH ROW
    EXECUTE FUNCTION update_last_updated();

-- View for quick queries
CREATE VIEW product_summary AS
SELECT 
    p.id,
    p.product_id,
    pl.name as platform,
    p.title,
    p.brand,
    p.category,
    p.current_price,
    p.discount_percent,
    p.rating,
    p.is_available,
    p.last_updated
FROM products p
JOIN platforms pl ON p.platform_id = pl.id
WHERE p.is_available = true
ORDER BY p.last_updated DESC;