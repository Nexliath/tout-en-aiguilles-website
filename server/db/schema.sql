-- ============================================================
-- Tout en Aiguilles — Schéma de base de données SQLite
-- ============================================================

-- Utilisateurs
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- 'customer' | 'admin'
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migration silencieuse : ajout email_verified si absent
-- (pour les bases de données existantes avant cette fonctionnalité)
CREATE TABLE IF NOT EXISTS _migrations (key TEXT PRIMARY KEY);
INSERT OR IGNORE INTO _migrations (key) VALUES ('email_verified_col');

-- Tokens de vérification d'email
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Note: email_verified est ajouté via migration dans database.js (ALTER TABLE)
-- pour compatibilité avec les bases de données existantes

-- Catégories
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL DEFAULT 'crochet' -- 'crochet' | 'couture'
);

-- Produits
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER REFERENCES categories(id),
  images TEXT NOT NULL DEFAULT '[]', -- JSON array of image paths
  tags TEXT DEFAULT '[]',            -- JSON array of tags
  is_featured INTEGER DEFAULT 0,     -- 0 | 1
  is_active INTEGER DEFAULT 1,       -- 0 | 1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Favoris
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, product_id)
);

-- Commandes
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT 'France',
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid | shipped | delivered | cancelled
  stripe_session_id TEXT,
  stripe_payment_intent TEXT,
  total REAL NOT NULL,
  items TEXT NOT NULL, -- JSON array of {product_id, name, price, qty, image}
  notes TEXT,
  delivery_type TEXT NOT NULL DEFAULT 'home', -- 'home' | 'relay' | 'handover'
  delivery_fee REAL NOT NULL DEFAULT 0,
  relay_point TEXT,   -- nom/adresse du point relais choisi
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Avis / Commentaires produits
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT,
  is_approved INTEGER NOT NULL DEFAULT 0, -- 0 = en attente, 1 = approuvé
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, user_id) -- un avis par utilisateur par produit
);

-- Articles / Actualités
CREATE TABLE IF NOT EXISTS news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  excerpt TEXT,
  content TEXT NOT NULL,
  cover_image TEXT,
  published INTEGER DEFAULT 0, -- 0 | 1
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- Données initiales
-- ============================================================

-- Catégories crochet
INSERT OR IGNORE INTO categories (name, slug, description, type) VALUES
  ('Doudous & Peluches', 'doudous-peluches', 'Adorables doudous et peluches au crochet pour bébés et enfants', 'crochet'),
  ('Accessoires', 'accessoires', 'Bonnets, écharpes, sacs et accessoires crochetés à la main', 'crochet'),
  ('Déco & Maison', 'deco-maison', 'Objets de décoration et accessoires maison au crochet', 'crochet');

-- Catégories couture
INSERT OR IGNORE INTO categories (name, slug, description, type) VALUES
  ('Tote Bags', 'tote-bags', 'Sacs fourre-tout et tote bags en tissu cousus à la main', 'couture'),
  ('Bébé & Enfant', 'bebe-enfant', 'Sorties de bain, bavoirs et accessoires bébé cousus avec amour', 'couture'),
  ('Accessoires Couture', 'accessoires-couture', 'Bananes, pochettes, lingettes démaquillantes et plus encore', 'couture');

-- Produits de démonstration — RETIRÉS (2026-08-23)
-- Ce bloc utilisait INSERT OR IGNORE sur products.slug : tant qu'un produit
-- existait, rien ne se passait, mais dès qu'il était supprimé par l'admin,
-- le slug redevenait libre et schema.sql (exécuté à CHAQUE démarrage du
-- serveur) le réinsérait automatiquement. C'était la cause des produits
-- "Doudou Ours Caramel", "Lingettes Démaquillantes", etc. qui revenaient
-- après chaque redéploiement, indépendamment de tout autre correctif.
-- Le seeding de contenu ne doit vivre que dans server/db/seedEtsy.js,
-- lui-même désormais protégé par la variable d'env RUN_SEED (opt-in explicite).

-- Article d'actualité de bienvenue
INSERT OR IGNORE INTO news (title, slug, excerpt, content, published) VALUES
  ('Bienvenue sur Tout en Aiguilles !',
   'bienvenue-tout-en-aiguilles',
   'Découvrez notre nouvelle boutique en ligne, directement depuis l''atelier de Victorine.',
   '<p>Bonjour et bienvenue sur <strong>Tout en Aiguilles</strong> ! 🧶</p>
<p>Je suis Victorine, créatrice passionnée de crochet et de couture. Avec ma maman, nous fabriquons à la main chaque article avec amour et minutie.</p>
<p>Dans notre boutique, vous trouverez :</p>
<ul>
  <li>🐰 Des <strong>doudous et peluches au crochet</strong> pour les tout-petits</li>
  <li>👜 Des <strong>tote bags et accessoires couture</strong> pour toute la famille</li>
  <li>🛁 Des <strong>sorties de bain, lingettes et essentiels bébé</strong> cousus avec soin</li>
</ul>
<p>Chaque création est unique et faite à la main en France. N''hésitez pas à nous contacter pour des commandes personnalisées !</p>
<p>Avec tout mon amour, Victorine 🌸</p>',
   1);
