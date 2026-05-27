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
