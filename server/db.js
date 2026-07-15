const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('UWAGA: brak zmiennej środowiskowej DATABASE_URL. Ustaw ją w panelu Render (Environment) na connection string bazy PostgreSQL.');
}

const connString = process.env.DATABASE_URL || '';
const needsSSL = process.env.NODE_ENV === 'production'
  || /neon\.tech/.test(connString)
  || /sslmode=require/.test(connString);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('Nieoczekiwany błąd puli połączeń Postgres:', err);
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY DEFAULT 1,
      seller JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT now(),
      CONSTRAINT settings_singleton CHECK (id = 1)
    );
  `);

  await pool.query(`
    INSERT INTO settings (id, seller)
    VALUES (1, '{}'::jsonb)
    ON CONFLICT (id) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS contractors (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      state JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS attachments (
      id SERIAL PRIMARY KEY,
      contractor_id INTEGER NOT NULL REFERENCES contractors(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      file_data BYTEA NOT NULL,
      uploaded_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_attachments_contractor_id ON attachments(contractor_id);
  `);

  console.log('Schemat bazy danych OK (settings, contractors, attachments).');
}

module.exports = { pool, initSchema };
