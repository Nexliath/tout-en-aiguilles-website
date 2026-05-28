require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Vérification node:sqlite ────────────────────────────────
try {
  require('node:sqlite');
} catch (e) {
  console.error('\n❌ node:sqlite non disponible.');
  console.error('   Vous utilisez Node.js', process.version);
  console.error('   node:sqlite est disponible à partir de Node.js v22.5.0\n');
  process.exit(1);
}

// ─── Middleware de sécurité ─────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false  // Désactivé en dev — à réactiver en production
}));
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
}));

// ─── Body parsing ───────────────────────────────────────────
app.use('/api/orders/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Fichiers statiques ─────────────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));

// ─── Routes API ─────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/news',     require('./routes/news'));

// ─── Setup premier lancement ────────────────────────────────
// Crée un compte admin directement (disponible seulement s'il n'y a aucun admin)
app.post('/api/setup', (req, res) => {
  const db = require('./db/database');
  const bcrypt = require('bcryptjs');
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';

  // Vérifier qu'il n'y a pas encore d'admin
  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (existingAdmin) {
    return res.status(403).json({ error: 'Un compte admin existe déjà. Utilisez la page de connexion.' });
  }

  const { email, password, first_name, last_name } = req.body;
  if (!email || !password || !first_name || !last_name) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }

  const hash = bcrypt.hashSync(password, 10);
  let userId;
  const existing = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);

  if (existing) {
    // L'email existe déjà → promouvoir en admin
    db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE email = ?").run(hash, email);
    userId = existing.id;
  } else {
    // Créer un nouveau compte admin
    const result = db.prepare(
      "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, 'admin')"
    ).run(email, hash, first_name, last_name);
    userId = result.lastInsertRowid;
  }

  const user = db.prepare('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?').get(userId);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user, message: 'Compte administrateur créé avec succès !' });
});

// ─── Test email config (temporaire) ─────────────────────────
app.get('/api/test-email', (req, res) => {
  res.json({
    smtp_host:      process.env.SMTP_HOST      || '❌ NON DÉFINI',
    smtp_port:      process.env.SMTP_PORT      || '❌ NON DÉFINI',
    smtp_user:      process.env.SMTP_USER      || '❌ NON DÉFINI',
    smtp_pass_set:  !!process.env.SMTP_PASS,
    smtp_from:      process.env.SMTP_FROM      || '❌ NON DÉFINI',
    base_url:       process.env.BASE_URL       || '❌ NON DÉFINI',
    configured:     !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS),
  });
});

// ─── Health check ───────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const db = require('./db/database');
  const users    = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const products = db.prepare('SELECT COUNT(*) as n FROM products WHERE is_active = 1').get().n;
  const admins   = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin'").get().n;
  res.json({
    status: 'ok', version: '1.0.0',
    db: { users, products, admins },
    setup_needed: admins === 0,
    setup_url: admins === 0 ? '/setup.html' : null
  });
});

// ─── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// ─── Démarrage ──────────────────────────────────────────────
app.listen(PORT, async () => {
  const db = require('./db/database');
  const admins = db.prepare("SELECT COUNT(*) as n FROM users WHERE role = 'admin'").get().n;

  console.log(`\n🧶 Tout en Aiguilles — Serveur démarré`);
  console.log(`   → Site     : http://localhost:${PORT}`);
  console.log(`   → Admin    : http://localhost:${PORT}/admin/`);
  console.log(`   → API      : http://localhost:${PORT}/api/health`);

  if (admins === 0) {
    console.log(`\n   ⚠️  Aucun admin configuré !`);
    console.log(`   → Setup   : http://localhost:${PORT}/setup.html`);
  } else {
    console.log(`   → ${admins} admin(s) configuré(s) ✓`);
  }
  console.log('');
});
