const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Config upload images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../client/assets/images/products');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `product_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// Helper: slugify
function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ─── Routes publiques ───────────────────────────────────────

// GET /api/products — liste avec filtres
router.get('/', (req, res) => {
  const { category, type, search, featured, limit = 50, offset = 0 } = req.query;
  let query = `
    SELECT p.*, c.name as category_name, c.slug as category_slug, c.type as category_type,
      ROUND(AVG(CASE WHEN r.is_approved = 1 THEN r.rating END), 1) as avg_rating,
      COUNT(CASE WHEN r.is_approved = 1 THEN r.id END) as review_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN reviews r ON r.product_id = p.id
    WHERE p.is_active = 1
  `;
  const params = [];
  if (category) { query += ' AND c.slug = ?'; params.push(category); }
  if (type)     { query += ' AND c.type = ?'; params.push(type); }
  if (search)   { query += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (featured) { query += ' AND p.is_featured = 1'; }
  query += ' GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
  params.push(Number(limit), Number(offset));

  const products = db.prepare(query).all(...params).map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    tags: JSON.parse(p.tags || '[]')
  }));
  res.json(products);
});

// GET /api/products/variants/:groupId — variantes d'un même groupe
// Doit être avant /:slug pour ne pas être intercepté
router.get('/variants/:groupId', (req, res) => {
  const variants = db.prepare(`
    SELECT p.id, p.name, p.slug, p.price, p.stock, p.images, p.variant_label, p.is_active
    FROM products p
    WHERE p.variant_group_id = ? AND p.is_active = 1
    ORDER BY p.created_at ASC
  `).all(req.params.groupId).map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
  }));
  res.json(variants);
});

// GET /api/products/categories — toutes les catégories
router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY type, name').all();
  res.json(cats);
});

// ─── Favoris (authentifié) ──────────────────────────────────
// IMPORTANT : ces routes doivent être déclarées AVANT /:slug pour ne pas être interceptées

// GET /api/products/favorites/list
router.get('/favorites/list', requireAuth, (req, res) => {
  const favs = db.prepare(`
    SELECT p.*, c.name as category_name, f.created_at as favorited_at
    FROM favorites f
    JOIN products p ON f.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE f.user_id = ? AND p.is_active = 1
    ORDER BY f.created_at DESC
  `).all(req.user.id).map(p => ({ ...p, images: JSON.parse(p.images || '[]') }));
  res.json(favs);
});

// GET /api/products/admin/all — tous les produits (admin)
router.get('/admin/all', requireAdmin, (req, res) => {
  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    ORDER BY p.created_at DESC
  `).all().map(p => ({ ...p, images: JSON.parse(p.images || '[]'), tags: JSON.parse(p.tags || '[]') }));
  res.json(products);
});

// GET /api/products/:slug — fiche produit
router.get('/:slug', (req, res) => {
  const p = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug, c.type as category_type
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.slug = ? AND p.is_active = 1
  `).get(req.params.slug);
  if (!p) return res.status(404).json({ error: 'Produit introuvable' });
  res.json({ ...p, images: JSON.parse(p.images || '[]'), tags: JSON.parse(p.tags || '[]') });
});

// POST /api/products/:id/favorite
router.post('/:id/favorite', requireAuth, (req, res) => {
  try {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, product_id) VALUES (?, ?)').run(req.user.id, req.params.id);
    res.json({ favorited: true });
  } catch { res.status(400).json({ error: 'Erreur' }); }
});

// DELETE /api/products/:id/favorite
router.delete('/:id/favorite', requireAuth, (req, res) => {
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.id);
  res.json({ favorited: false });
});

// ─── Admin ──────────────────────────────────────────────────

// POST /api/products — créer un produit
router.post('/', requireAdmin, upload.array('images', 5), (req, res) => {
  const { name, description, price, stock, category_id, tags, is_featured, variant_group_id, variant_label } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'Nom et prix requis' });
  const slug = slugify(name) + '-' + Date.now();
  const images = (req.files || []).map(f => `/assets/images/products/${f.filename}`);
  db.prepare(`
    INSERT INTO products (name, slug, description, price, stock, category_id, images, tags, is_featured, variant_group_id, variant_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, slug, description || '', Number(price), Number(stock) || 0,
         category_id || null, JSON.stringify(images), tags || '[]', is_featured ? 1 : 0,
         variant_group_id?.trim() || null, variant_label?.trim() || null);
  res.status(201).json({ success: true });
});

// PUT /api/products/:id — modifier un produit
router.put('/:id', requireAdmin, upload.array('images', 5), (req, res) => {
  const { name, description, price, stock, category_id, tags, is_featured, is_active, keep_images, variant_group_id, variant_label } = req.body;
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Produit introuvable' });

  let images = JSON.parse(keep_images || existing.images || '[]');
  if (req.files && req.files.length > 0) {
    const newImgs = req.files.map(f => `/assets/images/products/${f.filename}`);
    images = [...images, ...newImgs];
  }

  db.prepare(`
    UPDATE products SET name=?, description=?, price=?, stock=?, category_id=?,
    images=?, tags=?, is_featured=?, is_active=?, variant_group_id=?, variant_label=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name || existing.name, description ?? existing.description, Number(price) || existing.price,
         Number(stock) ?? existing.stock, category_id || existing.category_id,
         JSON.stringify(images), tags || existing.tags,
         is_featured !== undefined ? (is_featured === '1' || is_featured === 1 || is_featured === true ? 1 : 0) : existing.is_featured,
         is_active !== undefined   ? (is_active   === '1' || is_active   === 1 || is_active   === true ? 1 : 0) : existing.is_active,
         variant_group_id?.trim() || existing.variant_group_id || null,
         variant_label?.trim() || existing.variant_label || null,
         req.params.id);
  res.json({ success: true });
});

// DELETE /api/products/:id — supprimer définitivement un produit
router.delete('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM favorites WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM order_items WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  res.json({ success: true });
});

// POST /api/products/import/xls — import Excel
router.post('/import/xls', requireAdmin, multer({ storage: multer.memoryStorage() }).single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier Excel requis' });
  try {
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    let imported = 0, errors = [];
    const insertProd = db.prepare(`
      INSERT INTO products (name, slug, description, price, stock, category_id, images, tags, is_featured, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const upsertMany = db.transaction((rows) => {
      for (const row of rows) {
        try {
          const name = String(row['Nom'] || row['name'] || '').trim();
          if (!name) { errors.push(`Ligne ignorée : nom manquant`); continue; }
          const price = parseFloat(row['Prix'] || row['price'] || 0);
          const stock = parseInt(row['Stock'] || row['stock'] || 0);
          const description = String(row['Description'] || row['description'] || '');
          const tags = String(row['Tags'] || row['tags'] || '');
          const featured = row['Mis en avant'] === 'oui' || row['featured'] === 'true' ? 1 : 0;
          const slug = slugify(name) + '-' + Date.now() + '-' + imported;

          // Chercher la catégorie par nom
          let catId = null;
          const catName = String(row['Catégorie'] || row['category'] || '').trim();
          if (catName) {
            const cat = db.prepare('SELECT id FROM categories WHERE name = ? OR slug = ?').get(catName, slugify(catName));
            if (cat) catId = cat.id;
          }
          insertProd.run(name, slug, description, price, stock, catId, '[]', JSON.stringify(tags.split(',').map(t => t.trim()).filter(Boolean)), featured, 1);
          imported++;
        } catch (e) {
          errors.push(`Erreur ligne : ${e.message}`);
        }
      }
    });
    upsertMany(rows);
    res.json({ imported, errors });
  } catch (e) {
    res.status(500).json({ error: `Erreur lecture Excel : ${e.message}` });
  }
});

router.post('/stock-alert', (req, res) => {
  const { product_id, email } = req.body;
  if (!product_id || !email) return res.status(400).json({ error: 'product_id et email requis' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  try {
    db.prepare('INSERT OR IGNORE INTO stock_alerts (product_id, email) VALUES (?, ?)').run(Number(product_id), email.trim().toLowerCase());
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
