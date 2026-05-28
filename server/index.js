require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';

// Chemin d'accès au backoffice — configurable via variable d'environnement
// Valeur par défaut non-évidente, à remplacer dans Railway par ADMIN_PATH
const ADMIN_PATH = process.env.ADMIN_PATH || 'atelier';

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
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://tout-en-aiguilles.com';

app.use(helmet({
  contentSecurityPolicy: false,      // Requiert un audit page par page — ne pas activer à la légère
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin (Postman, apps mobiles) et l'origine configurée
    if (!origin || origin === ALLOWED_ORIGIN || origin === 'https://www.tout-en-aiguilles.com') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));
app.use(cookieParser());

// ─── Rate limiting ───────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10,                   // max 10 avis par heure par IP
  message: { error: 'Trop d\'avis soumis. Réessayez dans une heure.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Trop de requêtes. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Body parsing ───────────────────────────────────────────
app.use('/api/orders/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Bloquer l'ancien chemin /admin → 404 ───────────────────
// Les scanners cherchent /admin — ils ne trouveront rien
app.use('/admin', (req, res) => res.status(404).send('Not Found'));

// ─── Backoffice — chemin non-évident configurable ────────────
// Servi depuis client/admin/, accessible uniquement via /${ADMIN_PATH}/
// Protection réelle : formulaire de garde + APIs requireAdmin + rate limiting
app.use(`/${ADMIN_PATH}`, express.static(path.join(__dirname, '../client/admin')));

// ─── Fichiers statiques publics ──────────────────────────────
app.use(express.static(path.join(__dirname, '../client')));

// ─── Routes API ─────────────────────────────────────────────
app.use('/api/auth',            authLimiter, require('./routes/auth'));
app.use('/api/products',        require('./routes/products'));
app.use('/api/orders/checkout', checkoutLimiter);
app.use('/api/orders',          require('./routes/orders'));
app.use('/api/news',            require('./routes/news'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/reviews',         reviewLimiter, require('./routes/reviews'));

// ─── Setup premier lancement ────────────────────────────────
app.post('/api/setup', (req, res) => {
  const db = require('./db/database');
  const bcrypt = require('bcryptjs');

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
    db.prepare("UPDATE users SET role = 'admin', password_hash = ? WHERE email = ?").run(hash, email);
    userId = existing.id;
  } else {
    const result = db.prepare(
      "INSERT INTO users (email, password_hash, first_name, last_name, role) VALUES (?, ?, ?, ?, 'admin')"
    ).run(email, hash, first_name, last_name);
    userId = result.lastInsertRowid;
  }

  const user = db.prepare('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?').get(userId);
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user, message: 'Compte administrateur créé avec succès !' });
});

// ─── Admin path (pour le lien dans le header — réservé aux admins) ──────────
app.get('/api/admin-path', (req, res) => {
  // Vérifier que l'utilisateur est admin avant de révéler le chemin
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Non autorisé' });
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    res.json({ path: ADMIN_PATH });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// ─── Health check (minimal — ne pas exposer les données sensibles) ──────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
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
  console.log(`   → Admin    : http://localhost:${PORT}/${ADMIN_PATH}/`);
  console.log(`   → API      : http://localhost:${PORT}/api/health`);

  if (admins === 0) {
    console.log(`\n   ⚠️  Aucun admin configuré !`);
    console.log(`   → Setup   : http://localhost:${PORT}/setup.html`);
  } else {
    console.log(`   → ${admins} admin(s) configuré(s) ✓`);
  }
  console.log('');
});
