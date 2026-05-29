// node:sqlite est intégré dans Node.js 22.5+ — aucune compilation native requise
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../data/toutenaiguilles.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Créer le dossier data si nécessaire
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const _db = new DatabaseSync(DB_PATH);

// Activer WAL mode et foreign keys
_db.exec('PRAGMA journal_mode = WAL');
_db.exec('PRAGMA foreign_keys = ON');

// Initialiser le schéma
const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
_db.exec(schema);

// ─── Migrations sur base existante ──────────────────────────
// ALTER TABLE ne peut pas être dans le schema (IF NOT EXISTS n'existe pas pour les colonnes)
const migrations = [
  "ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0",
  "UPDATE users SET email_verified = 1 WHERE role = 'admin'",
  // Migration reviews table (pour bases existantes créées avant cette fonctionnalité)
  `CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT,
    is_approved INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, user_id)
  )`,
  // Migration photos d'avis
  `CREATE TABLE IF NOT EXISTS review_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
    photo_url TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  // Migration avatar utilisateur
  "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT NULL",
  // Migration pseudo utilisateur
  "ALTER TABLE users ADD COLUMN username TEXT DEFAULT NULL",
  // Pseudos pré-définis pour les comptes existants connus
  "UPDATE users SET username = 'Nexliath' WHERE lower(first_name) = 'victor' AND lower(last_name) = 'garnier' AND username IS NULL",
  "UPDATE users SET username = 'Vixtorine' WHERE lower(first_name) = 'victorine' AND lower(last_name) = 'richard' AND username IS NULL",
  // Changement d'email sécurisé
  "ALTER TABLE users ADD COLUMN pending_email TEXT DEFAULT NULL",
  "ALTER TABLE users ADD COLUMN email_change_token TEXT DEFAULT NULL",
  "ALTER TABLE users ADD COLUMN email_change_expires_at DATETIME DEFAULT NULL",
  // Table adresses
  `CREATE TABLE IF NOT EXISTS addresses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label TEXT NOT NULL DEFAULT 'Maison',
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'France',
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS promo_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE COLLATE NOCASE,
    discount_type TEXT NOT NULL DEFAULT 'percent',
    value REAL NOT NULL,
    min_order REAL DEFAULT 0,
    max_uses INTEGER DEFAULT NULL,
    uses_count INTEGER DEFAULT 0,
    expires_at TEXT DEFAULT NULL,
    is_active INTEGER DEFAULT 1,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT DEFAULT '',
    source TEXT DEFAULT 'website',
    is_active INTEGER DEFAULT 1,
    subscribed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS stock_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    notified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS cart_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_key TEXT NOT NULL UNIQUE,
    user_id INTEGER DEFAULT NULL,
    email TEXT DEFAULT NULL,
    items_json TEXT DEFAULT '[]',
    email_1h_sent INTEGER DEFAULT 0,
    email_24h_sent INTEGER DEFAULT 0,
    converted INTEGER DEFAULT 0,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`,
  "ALTER TABLE orders ADD COLUMN gift_wrap INTEGER DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN gift_message TEXT DEFAULT NULL",
  "ALTER TABLE orders ADD COLUMN gift_wrap_fee REAL DEFAULT 0",
  "ALTER TABLE orders ADD COLUMN promo_code TEXT DEFAULT NULL",
  "ALTER TABLE orders ADD COLUMN promo_discount REAL DEFAULT 0",
  "ALTER TABLE products ADD COLUMN options_json TEXT DEFAULT NULL",
  "ALTER TABLE products ADD COLUMN video_url TEXT DEFAULT NULL",
  "ALTER TABLE products ADD COLUMN variant_group_id TEXT DEFAULT NULL",
  "ALTER TABLE products ADD COLUMN variant_label TEXT DEFAULT NULL",
  // Préférence newsletter des utilisateurs
  "ALTER TABLE users ADD COLUMN newsletter_opt_out INTEGER DEFAULT 0",
  // Onboarder les utilisateurs vérifiés existants comme subscribers (source 'user')
  `INSERT OR IGNORE INTO newsletter_subscribers (email, first_name, source)
   SELECT email, first_name, 'user' FROM users WHERE email_verified = 1`,
];
for (const sql of migrations) {
  try { _db.exec(sql); } catch (e) { /* colonne déjà présente ou migration déjà appliquée */ }
}

// ─── Fix BigInt ──────────────────────────────────────────────
// node:sqlite retourne les entiers en BigInt — on les convertit
// automatiquement en Number pour être compatibles avec JSON et JWT
function fixBigInt(val) {
  if (val === null || val === undefined) return val;
  if (typeof val === 'bigint') return Number(val);
  if (Array.isArray(val)) return val.map(fixBigInt);
  if (typeof val === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(val)) out[k] = fixBigInt(v);
    return out;
  }
  return val;
}

// Wrapper transparent autour de db.prepare()
// — même API que better-sqlite3, BigInts automatiquement convertis
const db = {
  prepare(sql) {
    const stmt = _db.prepare(sql);
    return {
      get(...args)  { return fixBigInt(stmt.get(...args)); },
      all(...args)  { return fixBigInt(stmt.all(...args)); },
      run(...args)  {
        const r = stmt.run(...args);
        return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
      },
    };
  },
  exec(sql) { return _db.exec(sql); },
  // Émulation de db.transaction() de better-sqlite3
  transaction(fn) {
    return function(...args) {
      _db.exec('BEGIN');
      try {
        const result = fn(...args);
        _db.exec('COMMIT');
        return result;
      } catch (e) {
        _db.exec('ROLLBACK');
        throw e;
      }
    };
  },
};

module.exports = db;
