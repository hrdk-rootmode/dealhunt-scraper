src/
├── config/
│   ├── settings.js          # (Quotas, Festivals, AI config)
│   └── database.js          # (DB/Redis Connections)
├── core/
│   ├── engine.js            # (The Brain: Comparison logic, Fingerprinting)
│   ├── scraper-base.js      # (The Worker: AI Healing, Retry logic)
│   └── plugin-loader.js     # (The Auto-Discovery system)
├── platforms/               # (Just drop files here!)
│   ├── amazon.js
│   ├── flipkart.js
│   └── myntra.js
├── models/
│   └── queries.js           # (All SQL: Upsert, Analytics, History)
└── scripts/
    └── cron-manager.js      # (12h Scheduling logic)


    📅 The Execution Steps (Strict Order)

Step 1: I give you reset.js and setup_v2.sql. You run them to upgrade your database.
Step 2: I give you src/config.js and src/core/db.js (The Foundation).
Step 3: I give you src/core/scraper.js and src/core/ai.js (The Engine).
Step 4: I give you src/platforms/amazon.js and src/platforms/flipkart.js (The Workers).
Step 5: I give you server.js (The Controller).