const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        company     VARCHAR(255) NOT NULL,
        country     VARCHAR(10)  NOT NULL,
        sector      VARCHAR(100) NOT NULL,
        email       VARCHAR(255) NOT NULL,
        phone       VARCHAR(50),
        service     VARCHAR(100) NOT NULL,
        message     TEXT,
        lang        VARCHAR(5)   DEFAULT 'en',
        hubspot_id  VARCHAR(100),
        ip          VARCHAR(50),
        created_at  TIMESTAMPTZ  DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS leads_email_idx    ON leads(email);
      CREATE INDEX IF NOT EXISTS leads_created_idx  ON leads(created_at DESC);
    `);
    console.log('✅ Database ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
