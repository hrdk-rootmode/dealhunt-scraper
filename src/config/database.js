const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased timeout
    query_timeout: 10000,
});

pool.on('connect', () => {
    console.log('✅ Database connected');
});

pool.on('error', (err) => {
    console.error('❌ Database error:', err.message);
});

async function query(text, params) {
    const start = Date.now();
    try {
        const res = await pool.query(text, params);
        const duration = Date.now() - start;
        console.log('📊 Query executed', { duration, rows: res.rowCount });
        return res;
    } catch (error) {
        console.error('❌ Query error:', error.message);
        throw error;
    }
}

async function transaction(callback) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
}

module.exports = {
    query,
    transaction,
    pool
};