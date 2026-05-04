const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'autobot.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDb() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id            TEXT PRIMARY KEY,
      mst           TEXT NOT NULL,
      company       TEXT NOT NULL,
      address       TEXT NOT NULL,
      contact_name  TEXT NOT NULL,
      phone         TEXT NOT NULL,
      email         TEXT NOT NULL,
      note          TEXT,
      package_name  TEXT NOT NULL,
      package_price TEXT NOT NULL,
      file_name     TEXT,
      file_key      TEXT,
      file_size     INTEGER,
      status        TEXT DEFAULT 'new',
      created_at    TEXT DEFAULT (datetime('now')),
      updated_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS leads (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL,
      email         TEXT,
      company       TEXT,
      type          TEXT,
      interest      TEXT,
      source        TEXT DEFAULT 'landing',
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tax_otp_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      otp_code      TEXT NOT NULL,
      ip_address    TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_orders_mst ON orders(mst);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
  `);

  console.log('[DB] SQLite initialized OK');
}

module.exports = { getDb, initDb };
