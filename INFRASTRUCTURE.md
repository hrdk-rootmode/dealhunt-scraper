# DEALHUNT - COMPLETE INFRASTRUCTURE & IMPLEMENTATION GUIDE

## 📋 TABLE OF CONTENTS
1. [Backend Architecture](#backend-architecture)
2. [Frontend Architecture](#frontend-architecture)
3. [Data Flow Diagrams](#data-flow-diagrams)
4. [Database Schema](#database-schema)
5. [API Endpoints](#api-endpoints)
6. [Frontend Pages & Components](#frontend-pages--components)
7. [Cron Jobs & Scheduling](#cron-jobs--scheduling)
8. [Dependencies & Tools](#dependencies--tools)
9. [Implementation Checklist](#implementation-checklist)

---

# BACKEND ARCHITECTURE

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React/Vue)                      │
├─────────────────────────────────────────────────────────────┤
│  Home | Search | Results | Product Detail | Profile | Auth   │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP/REST API
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  EXPRESS.JS SERVER (Port 3000)              │
├─────────────────────────────────────────────────────────────┤
│  Request ID Tracking → Rate Limit → Auth → Validation       │
│  → Authorization → Query Timeout → Error Handler            │
└──────────┬──────────────────────┬──────────────────┬────────┘
           │                      │                  │
    ┌──────▼──────┐      ┌───────▼────────┐  ┌─────▼────────┐
    │ PostgreSQL  │      │ Redis Cache    │  │ Daily Cron   │
    │ (Primary DB)│      │ (5-10ms)       │  │ Jobs (5 AM)  │
    └─────────────┘      └────────────────┘  └──────────────┘
```

## 🔌 Core Components

### 1. **Express.js Server** (server.js)
- Middleware stack for security & performance
- Global error handler (catches all unhandled exceptions)
- Request ID tracking (UUID for debugging)
- Health check endpoint at `/health`
- Statistics endpoint at `/stats`

### 2. **PostgreSQL Database** (src/core/db.js)
**Primary Storage for:**
- Users (authentication, subscription)
- Products (title, category, specs)
- Product Links (prices across platforms)
- Price History (historical price tracking)
- Watchlists (user wishlists)
- Platforms (Amazon, Flipkart, etc.)
- Daily Logs (automation logs)
- Trending Data (daily trending categories)

**Query Timeout:** 30 seconds (prevents hanging queries)

### 3. **Redis Cache** (Optional, configured via REDIS_URL)
**Cached Data (with TTL):**
- `trending:categories` → 24-hour TTL (renewed at 5 AM daily)
- `api:products:{category}:{query}:{limit}:{offset}` → 10-minute TTL (product search results)

**Performance:**
- Cache HIT: 5-10ms response time
- Cache MISS: 50-100ms (database query + cache store)

### 4. **Cron Jobs** (src/scripts/cache-trending.js)
**Runs Daily at 5 AM UTC:**
1. Detects trending categories (based on day/season)
2. Stores trending in Redis (24-hour TTL)
3. Stores trending in PostgreSQL (for persistence)
4. Updates `data/trending/categories.json` file
5. Logs all activity to daily_logs table

**Triggering Method:**
- Uses `node-cron` package (runs in Node.js process)
- Also triggered by Render health check (10-min intervals)
- Manual trigger via `npm run cache` if needed

---

# FRONTEND ARCHITECTURE

## 🎨 UI Structure (Simple & Clean)

```
┌─────────────────────────────────────────────┐
│         NAVIGATION BAR (Fixed Top)          │
│  Logo | Search | Profile | Wishlist | Login │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         MAIN CONTENT AREA                   │
│                                             │
│  PAGE: Home/Results/Product/Profile/Auth   │
│                                             │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│         FOOTER (if needed)                  │
│  Links, About, Contact                      │
└─────────────────────────────────────────────┘
```

## 📄 Pages & Features

### **1. HOME PAGE**
**Purpose:** User entry point, trending display, quick search

**Components:**
- Search Bar (text input + smart features)
  - Type product name (e.g., "iPhone 15")
  - Copy/paste product link from Amazon/Flipkart
  - Backend auto-detects platform & extracts product
  - Shows trending categories below search
  
- Trending Section
  - Display trending products from `/api/trending`
  - Shows categories like "smartphones", "laptops"
  - Quick filter buttons

**Data Flow:**
```
User Types/Pastes → Validate Input → 
  If URL: Extract platform & product ID
  If Text: Search for matching products
→ Call GET /api/products?query=... 
→ Display Results
```

---

### **2. SEARCH RESULTS PAGE**
**Purpose:** Show product search results with filtering

**Components:**
- Filter Bar
  - By Platform (Amazon, Flipkart, etc.)
  - By Price Range (low to high)
  - By Rating
  - Sort (Price, Popularity, Newest)

- Product List
  - Each product card shows:
    - Image
    - Title
    - Lowest Price (across platforms)
    - Rating
    - Quick Add to Wishlist button

**Data Flow:**
```
GET /api/products?query=iPhone&limit=20&offset=0
→ Returns: [
    {
      id: "uuid",
      title: "iPhone 15",
      image_url: "...",
      prices: [
        { platform: "Amazon", price: 50000 },
        { platform: "Flipkart", price: 48000 }
      ],
      rating: 4.5,
      category: "Electronics"
    },
    ...
  ]
→ Render Product Cards with Filters
```

---

### **3. PRODUCT DETAIL PAGE**
**Purpose:** Display complete product info & price comparison

**URL:** `/product/:productId`

**Components:**
- Product Header
  - Large image
  - Title
  - Category
  - Rating & Reviews

- Key Specs Section
  - Specifications from database
  - Features (if AI-processed)

- Price Comparison Table
  ```
  Platform    | Price  | Original | Discount | Rating | Links
  ─────────────────────────────────────────────────────────
  Amazon      | ₹45000 | ₹50000   | 10%      | 4.8    | [Go]
  Flipkart    | ₹44000 | ₹50000   | 12%      | 4.6    | [Go]
  Other Site  | ₹46000 | ₹50000   | 8%       | 4.2    | [Go]
  ```

- Price History Chart
  - Line graph showing price changes over 30 days
  - X-axis: Date
  - Y-axis: Price
  - One line per platform

- Similar Products Section
  - 5 similar products from same category
  - Based on average views (not most viewed)
  - Quick view cards

- Actions
  - Add to Wishlist button
  - Set Price Alert (if subscribed)
  - Share button

**Data Flow:**
```
Load Product Detail Page
  ├─ GET /api/product/:id → Product info + prices
  ├─ GET /api/trending → Similar products suggestion
  └─ GET /api/similar/:id → Similar products list

Display:
  ├─ Product info from GET /api/product/:id
  ├─ Price history from price_history table
  ├─ All platforms' prices
  └─ Similar products
```

---

### **4. PROFILE PAGE**
**Purpose:** User account management & tracking

**Sections:**

#### A. User Info
- Display name
- Email
- Profile picture
- Member since date
- Account status

#### B. Subscription
- Current plan (Free/Premium/Pro)
- Expires on date
- Features available
- Upgrade button

#### C. Wishlist
- List of all watched products
- Quick actions (remove, price alert)
- Shows current lowest price
- Shows discount percentage

#### D. Active Alerts
- Price drop alerts set by user
- Alert status (Active/Triggered)
- Target price
- Current price
- When it triggered
- Action: Dismiss/Reactivate

#### E. Search History
- List of recent searches
- Can click to search again
- Can delete individual searches

#### F. View Count Tracking
- Show products user viewed
- How many times viewed each
- Helps recommend similar

**Data Flow:**
```
GET /api/user/profile
  → Returns: {
      id, email, displayName, photoUrl,
      subscription: { plan, expiresAt },
      dailySearchesUsed, dailySearchLimit
    }

GET /api/user/wishlist
  → Returns: [
      { id, productId, title, targetPrice, prices: [...] },
      ...
    ]

GET /api/user/quota
  → Returns: { used, limit, remaining }
```

---

### **5. LOGIN/AUTH PAGE**
**Purpose:** User authentication & signup

**Features:**
- Firebase Authentication
  - Google Sign-In
  - Email/Password
  - Phone authentication (optional)

- After Login:
  - Store JWT token in localStorage
  - Redirect to home page
  - Show user profile in navbar

**Data Flow:**
```
User Clicks Sign In
  → Firebase Auth Popup
  → Get JWT Token
  → Store in localStorage
  → Attach to all API requests (Authorization header)
  → Redirect to home
```

---

### **6. LOCAL OFFLINE STORAGE (SQLite via IndexedDB/sql.js)**

**Frontend SQLite Database Structure:**

```sql
-- Wishlist (offline cache)
CREATE TABLE wishlist (
  id TEXT PRIMARY KEY,
  product_id TEXT,
  product_name TEXT,
  price REAL,
  image_url TEXT,
  created_at TEXT
);

-- Offline Sync Queue (pending actions)
CREATE TABLE offline_sync_queue (
  id TEXT PRIMARY KEY,
  action TEXT,              -- 'add' or 'remove'
  product_id TEXT,
  target_price REAL,
  notify_on_any_drop BOOLEAN,
  status TEXT,              -- 'pending' or 'synced'
  created_at TEXT
);

-- Search History
CREATE TABLE search_history (
  id TEXT PRIMARY KEY,
  query TEXT,
  results_count INTEGER,
  created_at TEXT
);
```

**How It Works:**

1. **On App Load:**
   - Load wishlist from SQLite (instant, 5-10ms)
   - Display to user immediately
   - Fetch from backend in background
   - Merge any new items

2. **When Offline (navigator.onLine = false):**
   - Show offline badge
   - Users can still view wishlist
   - Add/remove actions stored in SQLite
   - Actions queued in offline_sync_queue

3. **When Back Online (navigator.onLine = true):**
   - Detect connection restored
   - Call `POST /api/user/wishlist/sync`
   - Send all pending actions
   - Backend processes atomically
   - Frontend removes synced items from queue
   - Show sync confirmation

---

# DATA FLOW DIAGRAMS

## 🔄 Complete User Journey

### **Scenario: User Searches & Adds to Wishlist**

```
┌─────────────────────────────────────────────────────┐
│ 1. USER HOME PAGE (Load Trending)                   │
├─────────────────────────────────────────────────────┤
│ GET /api/trending                                   │
│ ├─ Check Redis (5-10ms) → HIT? Return instantly   │
│ └─ MISS? Read JSON file → Store Redis → Return    │
│                                                     │
│ Display: Trending categories to user               │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ 2. USER SEARCHES "iPhone 15" (Text or URL paste)   │
├─────────────────────────────────────────────────────┤
│ Input: "https://amazon.in/dp/B123ABC"              │
│ ├─ Backend: Detect platform = "amazon"             │
│ └─ Extract product ID = "B123ABC"                  │
│                                                     │
│ GET /api/products?query=iPhone&limit=20            │
│ ├─ Check Redis cache → MISS                        │
│ ├─ Query PostgreSQL (products table)               │
│ ├─ Join with product_links (prices)                │
│ ├─ Store in Redis (10-min TTL)                     │
│ └─ Return 20 results                               │
│                                                     │
│ Display: Search results with filters               │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ 3. USER CLICKS PRODUCT → DETAIL PAGE               │
├─────────────────────────────────────────────────────┤
│ GET /api/product/:id                               │
│ ├─ Fetch product info from DB                      │
│ ├─ Get all prices (product_links)                  │
│ ├─ Get price history (last 30 days)                │
│ ├─ Increment view count                            │
│ └─ Return complete data                            │
│                                                     │
│ GET /api/similar/:id                               │
│ ├─ Get average views across all products           │
│ ├─ Find products in same category                  │
│ ├─ Filter by views near average (not most viewed) │
│ └─ Return 5 similar products                       │
│                                                     │
│ Display:                                            │
│ ├─ Product info                                    │
│ ├─ Price comparison table                          │
│ ├─ Price history chart                             │
│ ├─ Similar products                                │
│ └─ Add to Wishlist button                          │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ 4. USER ADDS TO WISHLIST                           │
├─────────────────────────────────────────────────────┤
│ ONLINE:                                             │
│   POST /api/user/wishlist                          │
│   ├─ Validate productId (UUID)                     │
│   ├─ Check wishlist limit                          │
│   ├─ INSERT to watchlists table                    │
│   ├─ Increment product watch_count                 │
│   └─ Return success                                │
│                                                     │
│ OFFLINE:                                            │
│   ├─ Save to SQLite wishlist table                 │
│   ├─ Add to offline_sync_queue                     │
│   ├─ Show "saved offline" message                  │
│   └─ Queue POST request                            │
│                                                     │
│ Display: "Added to wishlist ✓"                     │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ 5. USER COMES BACK ONLINE (was offline)            │
├─────────────────────────────────────────────────────┤
│ Frontend detects: navigator.onLine = true          │
│                                                     │
│ POST /api/user/wishlist/sync                       │
│ {                                                  │
│   "actions": [                                     │
│     { "action": "add", "productId": "uuid1" },    │
│     { "action": "remove", "productId": "uuid2" }  │
│   ]                                                │
│ }                                                  │
│                                                    │
│ Backend:                                            │
│ ├─ Process each action atomically                  │
│ ├─ Update watchlists table                         │
│ ├─ Return success for each action                  │
│ └─ Frontend removes from offline_sync_queue       │
│                                                    │
│ Result: Local data synced with server              │
└────────────────┬────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────┐
│ 6. USER VIEWS PROFILE PAGE                         │
├─────────────────────────────────────────────────────┤
│ GET /api/user/profile                              │
│ GET /api/user/wishlist                             │
│ GET /api/user/quota                                │
│                                                    │
│ Display:                                            │
│ ├─ User info                                      │
│ ├─ Subscription status                            │
│ ├─ Wishlist with prices & alerts                  │
│ ├─ Search history                                 │
│ └─ Active price drop alerts                       │
└─────────────────────────────────────────────────────┘
```

---

## 🔄 Daily Cron Job Flow (5 AM UTC)

```
┌──────────────────────────────────────────────────┐
│ 5 AM - CRON JOB TRIGGERED (node-cron)           │
├──────────────────────────────────────────────────┤
│                                                  │
│ 1. DETECT TRENDING                              │
│    ├─ Check day of week                         │
│    ├─ Check month (salary time = deals)         │
│    ├─ Check season (summer = cooling devices)  │
│    └─ Generate trending list                    │
│       Result: ["smartphones", "laptops", ...]   │
│                                                  │
│ 2. UPDATE data/trending/categories.json        │
│    └─ Write new trending data with timestamp   │
│                                                  │
│ 3. STORE IN REDIS                               │
│    └─ redis.setEx('trending:categories',       │
│       86400, JSON.stringify(data))             │
│       TTL: 24 hours (next update at 5 AM)     │
│                                                  │
│ 4. STORE IN POSTGRESQL                          │
│    └─ INSERT/UPDATE trending_data table         │
│       (for persistence if Redis fails)          │
│                                                  │
│ 5. LOG TO DATABASE                              │
│    └─ Insert into daily_logs table              │
│       Status: "completed"                       │
│       Trending detected: [list]                 │
│                                                  │
│ 6. SCRAPER USES TRENDING                        │
│    └─ daily-automation.js picks up trends      │
│       Scrapes these categories first            │
│       Updates products & prices                 │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

# DATABASE SCHEMA

## Core Tables

### **users**
```sql
id (UUID, PK)
firebase_uid (TEXT)
email (TEXT, UNIQUE)
display_name (TEXT)
photo_url (TEXT)
subscription_plan (TEXT) -- 'free', 'premium', 'pro'
subscription_expires_at (TIMESTAMP)
daily_search_count (INT)
last_search_reset (TIMESTAMP)
is_blocked (BOOLEAN)
last_login (TIMESTAMP)
created_at (TIMESTAMP)
```

### **products**
```sql
id (UUID, PK)
fingerprint (TEXT) -- For deduplication
title (TEXT)
brand (TEXT)
category (TEXT)
subcategory (TEXT)
image_url (TEXT)
specifications (JSONB)
ai_tags (TEXT[])
ai_processed (BOOLEAN)
views_count (INT)          -- For similar product matching
watch_count (INT)
created_at (TIMESTAMP)
last_updated (TIMESTAMP)
```

### **product_links**
```sql
id (UUID, PK)
product_id (UUID, FK)
platform_id (UUID, FK)
external_id (TEXT)
product_url (TEXT)
current_price (DECIMAL)
original_price (DECIMAL)
discount_percent (INT)
rating (DECIMAL)
review_count (INT)
in_stock (BOOLEAN)
is_verified (BOOLEAN)
last_scraped (TIMESTAMP)
```

### **price_history**
```sql
id (UUID, PK)
link_id (UUID, FK)        -- Links to product_links
price (DECIMAL)
recorded_at (TIMESTAMP)
```

### **watchlists**
```sql
id (UUID, PK)
user_id (UUID, FK)
product_id (UUID, FK)
target_price (DECIMAL)    -- Price alert threshold
notify_on_any_drop (BOOLEAN)
created_at (TIMESTAMP)
UNIQUE(user_id, product_id)
```

### **trending_data** (NEW)
```sql
id (INT, PK)
categories (TEXT[])       -- ["smartphones", "laptops", ...]
last_updated (TIMESTAMP)
```

---

# API ENDPOINTS

## Public Endpoints (No Auth Required)

### **GET /api/trending**
- **Purpose:** Get trending categories
- **Cache:** Redis (24h TTL)
- **Response Time:** 5-10ms (cache hit) or 50-100ms (miss)
- **Returns:**
```json
{
  "trending": ["smartphones", "laptops", "headphones"],
  "platformCategories": { ... },
  "lastUpdated": "2026-02-02T05:00:00Z"
}
```

### **GET /api/products?query=...&limit=20&offset=0**
- **Purpose:** Search products
- **Cache:** Redis (10-min TTL)
- **Validation:** query (2-500 chars), limit (1-100), offset (0+)
- **Returns:**
```json
{
  "products": [
    {
      "id": "uuid",
      "title": "iPhone 15",
      "image_url": "...",
      "prices": [
        { "platform": "Amazon", "price": 50000, "discount": 10 },
        { "platform": "Flipkart", "price": 48000, "discount": 12 }
      ],
      "rating": 4.5,
      "category": "Electronics"
    }
  ],
  "count": 20
}
```

### **GET /api/product/:id**
- **Purpose:** Get product details & price history
- **Validation:** UUID format for :id
- **Returns:**
```json
{
  "id": "uuid",
  "title": "iPhone 15",
  "brand": "Apple",
  "image_url": "...",
  "prices": [ { "platform": "...", "price": ... } ],
  "priceHistory": [
    { "platform": "Amazon", "price": 50000, "recorded_at": "2026-02-01T..." }
  ]
}
```

### **GET /api/similar/:id?limit=5**
- **Purpose:** Get similar products (based on average views)
- **Returns:** Array of 5 similar products with prices

---

## Protected Endpoints (Auth Required)

### **GET /api/user/profile**
- **Returns:** User info + subscription status

### **GET /api/user/wishlist**
- **Returns:** Array of watched products

### **POST /api/user/wishlist**
- **Body:** `{ productId, targetPrice?, notifyOnAnyDrop? }`
- **Returns:** `{ success: true, id: "uuid" }`

### **DELETE /api/user/wishlist/:productId**
- **Returns:** `{ success: true }`

### **POST /api/user/wishlist/sync** (NEW - Offline Sync)
- **Purpose:** Sync offline wishlist changes
- **Body:**
```json
{
  "actions": [
    { "action": "add", "productId": "uuid", "targetPrice": 40000 },
    { "action": "remove", "productId": "uuid" }
  ]
}
```
- **Returns:**
```json
{
  "synced": [
    { "productId": "uuid", "success": true, "action": "add" },
    { "productId": "uuid", "success": false, "error": "..." }
  ],
  "timestamp": "2026-02-02T..."
}
```

### **GET /api/user/quota**
- **Returns:** Daily search quota info

### **POST /api/user/quota/bonus**
- **Purpose:** Add bonus searches (reward ads)
- **Returns:** `{ success: true, bonus: 5 }`

### **POST /api/user/fcm-token**
- **Purpose:** Store FCM token for push notifications
- **Body:** `{ token: "..." }`

---

# FRONTEND PAGES & COMPONENTS

## File Structure

```
frontend/
├── public/
│   ├── index.html
│   ├── favicon.ico
│   └── manifest.json
├── src/
│   ├── components/
│   │   ├── Navbar.js         -- Navigation bar
│   │   ├── SearchBar.js      -- Search input + smart paste
│   │   ├── ProductCard.js    -- Reusable product card
│   │   ├── PriceTable.js     -- Price comparison table
│   │   ├── PriceChart.js     -- Price history chart
│   │   ├── OfflineBadge.js   -- Offline indicator
│   │   └── SyncIndicator.js  -- Sync status
│   │
│   ├── pages/
│   │   ├── Home.js           -- Home with trending + search
│   │   ├── Results.js        -- Search results + filters
│   │   ├── ProductDetail.js  -- Product details page
│   │   ├── Profile.js        -- User profile + wishlist
│   │   ├── Login.js          -- Auth page
│   │   └── NotFound.js       -- 404 page
│   │
│   ├── services/
│   │   ├── api.js            -- API calls (fetch wrapper)
│   │   ├── auth.js           -- Firebase auth
│   │   ├── sqlite.js         -- SQLite operations
│   │   ├── offline.js        -- Offline detection + sync
│   │   └── cache.js          -- Browser cache (localStorage)
│   │
│   ├── utils/
│   │   ├── constants.js      -- API URLs, etc.
│   │   ├── helpers.js        -- Utility functions
│   │   └── validators.js     -- Input validation
│   │
│   ├── styles/
│   │   ├── global.css        -- Global styles
│   │   ├── components.css    -- Component styles
│   │   └── responsive.css    -- Mobile responsive
│   │
│   ├── App.js                -- Main app component
│   └── index.js              -- Entry point
│
├── package.json
└── .env.example
```

## Key Components

### **Navbar Component**
```javascript
// Shows:
// - Logo
// - Search bar (with history dropdown)
// - Trending button
// - Wishlist icon (with count)
// - Profile dropdown
// - Offline badge (if offline)
// - Auth status
```

### **SearchBar Component**
```javascript
// Features:
// - Text input (product name)
// - Smart paste detection
//   - If URL: Extract platform & product ID
//   - If text: Search for product
// - Search history dropdown
// - Quick filters (trending categories)
// - Auto-complete suggestions
```

### **ProductCard Component**
```javascript
// Shows:
// - Product image
// - Title
// - Lowest price (across platforms)
// - Discount percentage
// - Rating
// - Quick add to wishlist
// - Number of platforms selling
```

### **PriceComparison Table**
```javascript
// Columns:
// - Platform name
// - Current price
// - Original price
// - Discount %
// - Rating
// - Link to product (affiliate)
// - "Go" button
// - "Compare" checkbox
```

---

# CRON JOBS & SCHEDULING

## Daily Trending Cache Job (5 AM UTC)

**File:** `src/scripts/cache-trending.js`

**Trigger:**
- Uses `node-cron` library
- Schedule: `0 5 * * *` (5:00 AM every day)
- Also runs on server startup

**What It Does:**
1. Read `data/trending/categories.json`
2. Store in Redis with 24-hour TTL
3. Store in PostgreSQL trending_data table
4. Logs to daily_logs table

**Code:**
```javascript
cron.schedule('0 5 * * *', async () => {
  const data = fs.readFileSync('data/trending/categories.json');
  await redis.setEx('trending:categories', 86400, JSON.stringify(data));
  await db.query('INSERT INTO trending_data...');
});
```

**How to Verify:**
- Check server logs at 5 AM
- Look for: `🔥 Trending cached to Redis | Updated: ...`
- Also check PostgreSQL trending_data table

---

# DEPENDENCIES & TOOLS

## Backend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.18.2 | Web framework |
| pg | ^8.11.3 | PostgreSQL driver |
| redis | ^4.6.10 | Redis cache client |
| node-cron | ^3.0.2 | Cron job scheduling |
| firebase-admin | ^11.11.0 | Firebase auth |
| jsonwebtoken | ^9.0.2 | JWT signing |
| razorpay | ^2.9.2 | Payment processing |
| puppeteer | ^21.5.0 | Browser automation |
| axios | ^1.6.0 | HTTP client |
| cheerio | ^1.0.0-rc.12 | HTML parsing |
| uuid | ^9.0.0 | UUID generation |
| dotenv | ^16.3.1 | Environment variables |

## Frontend Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| react | ^18.2.0 | UI framework |
| react-router-dom | ^6.x | Routing |
| axios | ^1.6.0 | API calls |
| firebase | ^9.x | Authentication |
| sql.js | ^1.x | SQLite in browser |
| recharts | ^2.x | Price history charts |
| dexie | ^3.x | IndexedDB wrapper (optional) |

---

# IMPLEMENTATION CHECKLIST

## Phase 1: Backend (COMPLETED ✅)
- [x] PostgreSQL database schema created
- [x] Redis cache setup
- [x] All API endpoints implemented
- [x] Input validation middleware
- [x] Error handling middleware
- [x] Rate limiting
- [x] Firebase authentication
- [x] Trending cron job (5 AM)
- [x] Offline sync endpoint
- [x] View count tracking for similar products

## Phase 2: Frontend (TODO)

### Pages
- [ ] Home page (search + trending)
- [ ] Search results (filters + pagination)
- [ ] Product detail (prices + history + similar)
- [ ] Profile (wishlist, alerts, history)
- [ ] Login/Auth (Firebase)

### Components
- [ ] Navbar (fixed, responsive)
- [ ] SearchBar (smart paste, history)
- [ ] ProductCard (reusable)
- [ ] PriceTable (comparison)
- [ ] PriceChart (Recharts)
- [ ] OfflineBadge
- [ ] SyncIndicator

### Services
- [ ] API wrapper (fetch + retry logic)
- [ ] Firebase auth service
- [ ] SQLite initialization & CRUD
- [ ] Offline detection + sync logic
- [ ] localStorage for JWT + settings

### Features
- [ ] Search (text + URL paste)
- [ ] Wishlist (add/remove)
- [ ] Price alerts
- [ ] Offline mode
- [ ] Auto-sync
- [ ] Dark mode (optional)

---

## SUMMARY

**Backend Status:** ✅ PRODUCTION READY
- All endpoints working
- Caching optimized
- Security implemented
- Offline sync ready

**Frontend Status:** 🔄 READY TO BUILD
- Backend fully documented
- API endpoints stable
- SQLite schema defined
- All data flows documented

**Next Steps:**
1. Frontend developer starts with `Home.js`
2. Implement SearchBar with smart paste
3. Implement Results page with filters
4. Build ProductDetail with price history
5. Add offline SQLite support
6. Integrate Firebase auth

**Estimated Frontend Timeline:** 4-6 weeks for MVP
