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
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

-- Produit exemple (doudou)
INSERT OR IGNORE INTO products (name, slug, description, price, stock, category_id, images, tags, is_featured) VALUES
  ('Doudou Lapin Rose', 'doudou-lapin-rose',
   'Un adorable doudou lapin au crochet, tout doux et fait main avec amour. Parfait pour accompagner bébé dans ses aventures. Lavable en machine à 30°C. Taille : 25 cm environ.',
   28.00, 5, 1, '["placeholder_lapin.jpg"]', '["bébé","cadeau","crochet"]', 1),

  ('Doudou Ours Caramel', 'doudou-ours-caramel',
   'Un petit ours au crochet tout moelleux, réalisé en laine douce et hypoallergénique. Idéal comme cadeau de naissance.',
   32.00, 3, 1, '["placeholder_ours.jpg"]', '["bébé","cadeau","crochet"]', 1),

  ('Tote Bag Fleuri', 'tote-bag-fleuri',
   'Tote bag en coton imprimé fleuri, doublé intérieur, avec poche zippée. Solide et pratique pour le quotidien. Dimensions : 38x42 cm.',
   22.00, 8, 4, '["placeholder_tote.jpg"]', '["couture","fleurs","pratique"]', 1),

  ('Sortie de Bain Bébé', 'sortie-de-bain-bebe',
   'Cape de bain en éponge ultra-douce pour bébé, avec capuche oreilles de lapin. Broderie personnalisable sur commande.',
   38.00, 4, 5, '["placeholder_bain.jpg"]', '["bébé","couture","cadeau naissance"]', 0),

  ('Lingettes Démaquillantes (lot de 7)', 'lingettes-demaquillantes',
   'Set de 7 lingettes démaquillantes lavables, en coton et éponge bambou. Zéro déchet et douces pour la peau.',
   14.00, 15, 6, '["placeholder_lingettes.jpg"]', '["écologie","couture","beauté"]', 0),

  ('Banane Zippée', 'banane-zippee',
   'Sac banane en tissu coton, avec fermeture éclair et anse réglable. Pratique pour les balades et sorties.',
   26.00, 6, 6, '["placeholder_banane.jpg"]', '["couture","sac","pratique"]', 0);

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
