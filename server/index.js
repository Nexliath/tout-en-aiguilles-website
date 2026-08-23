require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { processAndSaveImage } = require('./utils/imageProcess');
const { asyncRoute } = require('./middleware/asyncRoute');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';

// Chemin d'accès au backoffice — configurable via variable d'environnement
// Valeur par défaut non-évidente, à remplacer dans Railway par ADMIN_PATH
const ADMIN_PATH = process.env.ADMIN_PATH || 'atelier';

// ─── Alerte sécurité : valeurs par défaut détectées ──────────
// Ces valeurs par défaut sont visibles dans le code source (donc publiques).
// En production, JWT_SECRET et ADMIN_PATH DOIVENT être définis dans les
// variables d'environnement Railway avec des valeurs uniques.
if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT) {
  if (!process.env.JWT_SECRET) {
    console.warn('\n⚠️⚠️⚠️  SÉCURITÉ : JWT_SECRET non défini — valeur par défaut (publique) utilisée !');
    console.warn('   → Définissez JWT_SECRET dans les variables Railway (chaîne aléatoire longue).\n');
  }
  if (!process.env.ADMIN_PATH) {
    console.warn('\n⚠️⚠️⚠️  SÉCURITÉ : ADMIN_PATH non défini — chemin admin par défaut ("atelier", public) utilisé !');
    console.warn('   → Définissez ADMIN_PATH dans les variables Railway avec une valeur secrète.\n');
  }
}

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

// ─── Trust proxy (Railway / Cloudflare reverse proxy) ────────
// Nécessaire pour que express-rate-limit identifie correctement les IPs
// via l'en-tête X-Forwarded-For posé par Railway.
app.set('trust proxy', 1);

// ─── Rate limiting ───────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
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

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5,                    // max 5 messages par heure par IP (anti-spam)
  message: { error: 'Trop de messages envoyés. Réessayez dans une heure.' },
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
// Même limiteur que /checkout — sans ça, /paypal/create crée une ligne
// "orders" (pending) + déclenche un email de notification boutique à
// CHAQUE appel, sans aucune limite : un script peut spammer indéfiniment.
app.use('/api/orders/paypal/create',  checkoutLimiter);
app.use('/api/orders/paypal/capture', checkoutLimiter);
app.use('/api/orders',          require('./routes/orders'));
app.use('/api/addresses',       require('./routes/addresses'));
app.use('/api/promo',      require('./routes/promo'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/cart',       require('./routes/cart'));
app.use('/api/news',            require('./routes/news'));
app.use('/api/admin',           require('./routes/admin'));
app.use('/api/reviews',         require('./routes/reviews'));

// ─── Formulaire de contact ───────────────────────────────────
app.post('/api/contact', contactLimiter, async (req, res) => {
  const { name, email, message } = req.body;
  if (!name?.trim() || !email?.trim() || !message?.trim())
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Adresse email invalide' });
  if (message.trim().length > 2000)
    return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });

  try {
    const { sendContactEmail } = require('./utils/email');
    await sendContactEmail(name.trim(), email.trim(), message.trim());
    res.json({ success: true, message: 'Message envoyé !' });
  } catch (err) {
    console.error('Erreur envoi contact:', err.message);
    res.status(500).json({ error: 'Erreur lors de l\'envoi. Réessayez ou contactez-nous par email.' });
  }
});

// ─── Formulaire de commande personnalisée ────────────────────
// En mémoire : la photo d'inspiration est redimensionnée/compressée (sharp)
// avant écriture sur disque, comme pour les avis clients (voir reviews.js).
const CUSTOM_ORDER_IMG_DIR = path.join(__dirname, '../client/assets/images/custom-orders');
const customOrderUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Seules les images sont autorisées'));
    cb(null, true);
  }
});

app.post('/api/contact/custom-order', contactLimiter, customOrderUpload.single('photo'), asyncRoute(async (req, res) => {
  const { name, email, message, creationType, color, size, timeline, budget } = req.body;
  if (!name?.trim() || !email?.trim())
    return res.status(400).json({ error: 'Nom et email requis' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Adresse email invalide' });
  if ((message || '').trim().length > 2000)
    return res.status(400).json({ error: 'Message trop long (2000 caractères max)' });

  let photoUrl = null;
  if (req.file) {
    const filename = await processAndSaveImage(req.file.buffer, CUSTOM_ORDER_IMG_DIR, `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, { maxWidth: 1600, maxHeight: 1600 });
    photoUrl = `/assets/images/custom-orders/${filename}`;
  }

  const { sendCustomOrderEmail } = require('./utils/email');
  await sendCustomOrderEmail(name.trim(), email.trim(), {
    creationType: (creationType || '').trim(),
    color: (color || '').trim(),
    size: (size || '').trim(),
    timeline: (timeline || '').trim(),
    budget: (budget || '').trim(),
    message: (message || '').trim(),
  }, photoUrl);

  res.json({ success: true, message: 'Demande envoyée !' });
}));

// ─── Sitemap XML dynamique ───────────────────────────────────
app.get('/sitemap.xml', (req, res) => {
  const db = require('./db/database');
  const BASE = 'https://tout-en-aiguilles.com';
  const today = new Date().toISOString().split('T')[0];

  const staticPages = [
    { url: '/',              priority: '1.0', changefreq: 'weekly'  },
    { url: '/boutique.html', priority: '0.9', changefreq: 'daily'   },
    { url: '/actualites.html',priority:'0.7', changefreq: 'weekly'  },
  ];

  const products = db.prepare(
    "SELECT slug, updated_at FROM products WHERE is_active = 1 ORDER BY updated_at DESC"
  ).all();

  let articles = [];
  try {
    articles = db.prepare(
      "SELECT slug, updated_at FROM news WHERE published = 1 AND (publish_at IS NULL OR publish_at <= CURRENT_TIMESTAMP) ORDER BY updated_at DESC"
    ).all();
  } catch (e) {}

  const urls = [
    ...staticPages.map(p => `
  <url>
    <loc>${BASE}${p.url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`),
    ...products.map(p => `
  <url>
    <loc>${BASE}/produit.html?slug=${p.slug}</loc>
    <lastmod>${(p.updated_at || today).split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`),
    ...articles.map(a => `
  <url>
    <loc>${BASE}/actualites.html?slug=${a.slug}</loc>
    <lastmod>${(a.updated_at || today).split('T')[0]}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`),
  ];

  res.header('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('')}
</urlset>`);
});

// ─── Setup premier lancement ────────────────────────────────
// authLimiter : cette route bootstrap le tout premier compte admin et n'est
// pas sous /api/auth (donc pas déjà couverte par le authLimiter appliqué à
// ce préfixe) — sans ça, elle restait le seul endpoint sensible non limité.
app.post('/api/setup', authLimiter, (req, res) => {
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
  // Même exigence que l'inscription client (server/routes/auth.js /register) —
  // le compte créé ici a accès à TOUT le site, il ne doit pas avoir une
  // barrière plus faible que celle d'un simple compte client.
  if (password.length < 8) {
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  }
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial' });
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
  // email_verified est normalement forcé à 1 pour tout compte admin par la
  // migration de démarrage (server/db/database.js), mais celle-ci ne
  // s'applique qu'au prochain redémarrage — on le fixe ici tout de suite
  // pour que /api/auth/login n'exige pas une vérification d'email inutile
  // avant même le premier redéploiement.
  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(userId);

  // Le tout premier compte admin doit lui aussi activer le MFA avant de
  // recevoir un vrai token de session — même règle que /api/auth/login,
  // pas de contournement possible via la page de setup initiale.
  const setupToken = jwt.sign({ id: userId, purpose: 'mfa_setup' }, JWT_SECRET, { expiresIn: '15m' });
  res.json({ mfa_setup_required: true, setup_token: setupToken, message: 'Compte administrateur créé — activez la double authentification pour continuer.' });
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

// ─── 404 ──────────────────────────────────────────────────────
// Toute route non trouvée (ni fichier statique, ni route API) renvoie une
// vraie page 404 avec le bon code HTTP. Avant, n'importe quelle URL
// invalide renvoyait la page d'accueil en 200 OK (« soft 404 »), ce qui
// nuit au référencement et n'aide pas un visiteur qui a tapé une mauvaise
// adresse. Générée directement ici (pas un fichier statique séparé) pour
// éviter tout souci de propagation du fichier lors du déploiement.
const NOT_FOUND_HTML = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Page introuvable — Tout en Aiguilles</title>
<link rel="icon" type="image/svg+xml" href="/assets/images/favicon.svg">
<link rel="stylesheet" href="/assets/css/style.css">
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo"><span class="logo-icon">🧶</span>Tout en <span>Aiguilles</span></a>
  </div>
</header>
<div class="section" style="text-align:center;padding:100px 20px">
  <div style="font-size:4rem;margin-bottom:16px">🧶</div>
  <h1 style="margin-bottom:12px">Page introuvable</h1>
  <p style="color:var(--text-light);margin-bottom:32px">Ce fil s'est égaré… la page que vous cherchez n'existe pas ou plus.</p>
  <a href="/" class="btn btn-primary">Retour à l'accueil</a>
  <a href="/boutique.html" class="btn btn-secondary" style="margin-left:12px">Voir la boutique</a>
</div>
<footer class="site-footer">
  <div class="container">
    <div style="display:flex;justify-content:space-between;padding:20px 0;border-top:1px solid rgba(255,255,255,.1);font-size:.8rem;color:rgba(255,255,255,.6)">
      <span>© 2024 Tout en Aiguilles</span>
      <a href="/" style="color:rgba(255,255,255,.6)">Accueil</a>
    </div>
  </div>
</footer>
</body>
</html>`;

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Route API introuvable' });
  }
  res.status(404).send(NOT_FOUND_HTML);
});

// ─── Demandes d'avis automatiques (J+8, 10h heure de Paris) ────
async function sendPendingReviewReminders() {
  // Vérifier que l'heure locale de Paris est entre 10h et 11h
  const nowParis = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false });
  const hour = parseInt(nowParis, 10);
  if (hour < 10 || hour >= 11) return; // On ne traite qu'entre 10h et 11h

  try {
    const db = require('./db/database');
    const { sendReviewRequestEmail } = require('./utils/email');
    const eligible = db.prepare(`
      SELECT * FROM orders
      WHERE status = 'delivered'
      AND review_requested_at IS NULL
      AND updated_at <= datetime('now', '-7 days')
    `).all();

    for (const order of eligible) {
      try {
        await sendReviewRequestEmail({ ...order, items: JSON.parse(order.items || '[]') });
        db.prepare('UPDATE orders SET review_requested_at = CURRENT_TIMESTAMP WHERE id = ?').run(order.id);
        console.log(`📧 Demande d'avis envoyée — commande #${order.id} (${order.email})`);
      } catch (e) {
        console.error(`❌ Demande d'avis échouée — commande #${order.id}:`, e.message);
      }
    }
    if (eligible.length > 0) {
      console.log(`📧 Review reminders : ${eligible.length} traité(s)`);
    }
  } catch (e) {
    console.error('Erreur review reminders:', e.message);
  }
}

// Vérification toutes les heures
setInterval(sendPendingReviewReminders, 60 * 60 * 1000);

async function checkAbandonedCarts() {
  try {
    const db = require('./db/database');
    const { sendAbandonedCartEmail } = require('./utils/email');
    const carts1h = db.prepare(`SELECT * FROM cart_sessions WHERE email IS NOT NULL AND converted = 0 AND email_1h_sent = 0 AND datetime(updated_at, '+1 hours') <= datetime('now') AND items_json != '[]'`).all();
    for (const cart of carts1h) {
      try {
        await sendAbandonedCartEmail(cart.email, '', JSON.parse(cart.items_json || '[]'));
        db.prepare('UPDATE cart_sessions SET email_1h_sent = 1 WHERE id = ?').run(cart.id);
      } catch(e) {}
    }
    const carts24h = db.prepare(`SELECT * FROM cart_sessions WHERE email IS NOT NULL AND converted = 0 AND email_24h_sent = 0 AND email_1h_sent = 1 AND datetime(updated_at, '+24 hours') <= datetime('now') AND items_json != '[]'`).all();
    for (const cart of carts24h) {
      try {
        await sendAbandonedCartEmail(cart.email, '', JSON.parse(cart.items_json || '[]'));
        db.prepare('UPDATE cart_sessions SET email_24h_sent = 1 WHERE id = ?').run(cart.id);
      } catch(e) {}
    }
  } catch(e) { console.error('Abandoned cart check error:', e.message); }
}

async function checkStockAlerts() {
  try {
    const db = require('./db/database');
    const { sendBackInStockEmail } = require('./utils/email');
    const alerts = db.prepare(`SELECT sa.*, p.name, p.price, p.images, p.slug FROM stock_alerts sa JOIN products p ON p.id = sa.product_id WHERE sa.notified = 0 AND p.stock > 0 AND p.is_active = 1`).all();
    for (const alert of alerts) {
      try {
        await sendBackInStockEmail(alert.email, { name: alert.name, price: alert.price, image: JSON.parse(alert.images || '[]')[0], slug: alert.slug, id: alert.product_id });
        db.prepare('UPDATE stock_alerts SET notified = 1 WHERE id = ?').run(alert.id);
      } catch(e) {}
    }
  } catch(e) {}
}

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

  // ─── Seed des articles d'actualité — DÉSACTIVÉ par défaut ────
  // Le flag anti-rejeu stocké en base s'est avéré peu fiable au redémarrage
  // (produits supprimés qui revenaient après chaque déploiement). Plutôt que
  // de dépendre d'un état en base, le seed ne s'exécute plus QUE si la
  // variable d'env RUN_SEED=true est explicitement définie sur Railway.
  // Par défaut : aucun seed ne tourne jamais tout seul, donc rien ne peut
  // jamais réapparaître automatiquement, quoi qu'il arrive à la base.
  if (process.env.RUN_SEED === 'true') {
    console.log('🌱 RUN_SEED=true détecté — exécution du seed (news + produits Etsy)…');
    seedNews(db);
    const { seedEtsyProducts } = require('./db/seedEtsy');
    seedEtsyProducts(db);
  }

  // ─── Avis de lancement (générés) — opt-in explicite ──────────
  // Même principe que RUN_SEED : ne tourne que si la variable d'env
  // RUN_FAKE_REVIEWS_SEED=true est définie sur Railway. Protégé par un flag
  // en base pour ne s'exécuter qu'une seule fois.
  if (process.env.RUN_FAKE_REVIEWS_SEED === 'true') {
    console.log('🌱 RUN_FAKE_REVIEWS_SEED=true détecté — génération des avis de lancement…');
    const { seedFakeReviews } = require('./db/seedFakeReviews');
    seedFakeReviews(db);
  }
  setInterval(checkAbandonedCarts, 60 * 60 * 1000);
  setInterval(checkStockAlerts, 60 * 60 * 1000);
});

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function seedNews(db) {
  // Guard : ne seeder qu'une seule fois (même logique que seedEtsyProducts)
  db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const alreadySeeded = db.prepare(`SELECT value FROM app_settings WHERE key = 'news_seed_done'`).get();
  if (alreadySeeded) return;

  const articles = [
    {
      title: "Foire à tout de La Mailleray-sur-Seine — notre première sortie !",
      excerpt: "Le 12 avril, on posait nos valises (et nos crochets !) à La Mailleray-sur-Seine pour notre toute première participation à une foire à tout. Une journée inoubliable, pleine de rencontres et de couleurs.",
      cover_image: "/assets/images/news/mailleray-11.jpg",
      created_at: "2026-04-14 10:00:00",
      content: `<p>Le dimanche 12 avril 2026, Tout en Aiguilles prenait la route pour La Mailleray-sur-Seine, une charmante commune normande où se tenait la foire à tout annuelle. Une première pour nous — et quelle première !</p>

<figure>
  <img src="/assets/images/news/mailleray-11.jpg" alt="Le stand Tout en Aiguilles à La Mailleray-sur-Seine" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Le stand en plein soleil 🌞</figcaption>
</figure>

<h2>Un stand coloré au cœur du village</h2>
<p>Dès 7h du matin, on installait la table, on déroulait la nappe et on sortait les créations une par une : bouquets de fleurs en crochet, peluches en tous genres, doudous, tote bags, bijoux... Le stand s'est transformé en petit coin de douceur au beau milieu de la foire.</p>
<p>Les passants s'arrêtaient, touchaient les laines, souriaient. <em>"C'est vous qui faites tout ça à la main ?!"</em> — une question qu'on a entendue des dizaines de fois dans la journée, avec toujours le même plaisir à répondre oui.</p>

<figure>
  <img src="/assets/images/news/mailleray-6.jpg" alt="Créations crochet exposées" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Bouquets, peluches et douceurs au crochet</figcaption>
</figure>

<h2>Des rencontres qui font chaud au cœur</h2>
<p>Au-delà des ventes, ce qui nous a le plus marqué, c'est la chaleur des gens. Une mamie qui voulait apprendre le crochet, une jeune maman qui cherchait un doudou original pour sa fille, un enfant qui n'arrivait pas à lâcher un petit poulpe... Ces moments-là, on les garde précieusement.</p>

<figure>
  <img src="/assets/images/news/mailleray-7.jpg" alt="Détail des créations" style="width:100%;border-radius:12px;margin:8px 0">
</figure>

<h2>Bilan : une journée pleine de promesses</h2>
<p>La Mailleray-sur-Seine, c'était notre baptême du feu des marchés et foires en plein air. On est rentrées fatiguées mais heureuses, avec des carnets de commandes, des sourires plein la tête et une certitude : on reviendra !</p>

<figure>
  <img src="/assets/images/news/mailleray-12.jpg" alt="Fin de journée au marché" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Fin de journée — rangement en cours 😄</figcaption>
</figure>

<p>Merci à tous ceux qui se sont arrêtés, qui ont acheté, qui ont encouragé. Vous êtes la raison pour laquelle on continue à crocheter avec autant d'amour. À très vite pour la prochaine aventure ! 🧶🌸</p>`
    },
    {
      title: "Marché rue Lamarck à Paris — une matinée parisienne pleine d'énergie",
      excerpt: "Direction le 18ème arrondissement pour le marché de la rue Lamarck ! Une belle matinée sous les toits de Paris, entre Montmartre et les créations colorées.",
      cover_image: "/assets/images/news/lamarck-cover.jpg",
      created_at: "2026-03-30 10:00:00",
      content: `<p>Fin mars, on chargeait la voiture à l'aube et on fonçait vers le 18ème arrondissement de Paris pour le marché de la rue Lamarck. Entre Montmartre et les petites rues pavées, un cadre de rêve pour présenter nos créations.</p>

<figure>
  <img src="/assets/images/news/lamarck-cover.jpg" alt="Stand Tout en Aiguilles rue Lamarck Paris" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Notre stand rue Lamarck, dans l'animation du marché parisien</figcaption>
</figure>

<h2>Paris, ses marchés et sa clientèle curieuse</h2>
<p>Le marché de la rue Lamarck, c'est une institution du quartier. Les habitués arrivent tôt, connaissent les exposants, ont l'œil avisé. Quand ils se sont penchés sur nos peluches et nos bouquets en laine, on a senti qu'on avait quelque chose à leur offrir d'un peu différent.</p>
<p>Les fleurs en crochet ont été les grandes vedettes de la matinée — plusieurs bouquets sont partis dans les premières heures. <em>"C'est tellement plus durable qu'un vrai bouquet"</em>, nous a glissé une cliente avec le sourire.</p>

<figure>
  <img src="/assets/images/news/lamarck-2.jpg" alt="Créations exposées" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Un aperçu des créations du jour</figcaption>
</figure>

<h2>L'ambiance unique des marchés parisiens</h2>
<p>Ce qui est particulier avec Paris, c'est le mélange des gens : des familles du quartier, des touristes qui déambulent, des connaisseurs qui prennent le temps d'examiner chaque point de crochet. On a eu des conversations en français, en anglais, en espagnol — notre petit stand est devenu un point de rencontre inattendu.</p>

<figure>
  <img src="/assets/images/news/lamarck-3.jpg" alt="Ambiance du marché" style="width:100%;border-radius:12px;margin:8px 0">
</figure>

<h2>Des commandes personnalisées qui décollent</h2>
<p>L'une des belles surprises de cette journée : plusieurs personnes repartaient non pas avec un produit fini, mais avec l'idée d'une commande sur-mesure. Un prénom à broder, une couleur précise pour assortir à une chambre d'enfant... Ces demandes-là nous touchent particulièrement, parce qu'elles montrent que nos créations s'invitent dans des histoires de famille.</p>

<figure>
  <img src="/assets/images/news/lamarck-4.jpg" alt="Détail des créations faites main" style="width:100%;border-radius:12px;margin:8px 0">
  <figcaption style="font-size:.82rem;color:#888;text-align:center;margin-top:6px">Chaque pièce, unique et faite main 🌸</figcaption>
</figure>

<p>La rue Lamarck, on en garde un souvenir radieux. Paris nous a accueillies avec bienveillance, et on espère bien y revenir. En attendant, toutes nos créations sont disponibles sur la boutique en ligne — parce que la douceur du fait main ne devrait pas avoir de frontières géographiques. 🧶✨</p>`
    }
  ];

  for (const article of articles) {
    const exists = db.prepare('SELECT id FROM news WHERE title = ?').get(article.title);
    if (!exists) {
      const slug = slugify(article.title) + '-' + Date.now();
      db.prepare(`
        INSERT INTO news (title, slug, excerpt, content, cover_image, published, created_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
      `).run(article.title, slug, article.excerpt, article.content, article.cover_image, article.created_at);
      console.log(`📰 Article créé : ${article.title}`);
    }
  }
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('news_seed_done', '1')`).run();
}
