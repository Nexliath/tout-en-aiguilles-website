const express = require('express');
let _loyaltyAward = null;
function awardLoyalty(userId, action, pts, ref) {
  try { if (!_loyaltyAward) _loyaltyAward = require('./loyalty').awardPoints; _loyaltyAward(userId, action, pts, ref); } catch {}
}
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ─── Config upload photos d'avis ────────────────────────────
const { uploadImage } = require('../utils/imageUpload');
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Seules les images sont autorisées'));
    cb(null, true);
  }
});

// ─── GET /api/reviews?product_id=X ──────────────────────────
// Public : retourne les avis approuvés + leurs photos pour un produit
router.get('/', (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id requis' });

  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at,
           COALESCE(r.verified_purchase, 0) as verified_purchase,
           u.first_name, u.last_name,
           GROUP_CONCAT(rp.photo_url) AS photos_raw
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    LEFT JOIN review_photos rp ON rp.review_id = r.id
    WHERE r.product_id = ? AND r.is_approved = 1
    GROUP BY r.id
    ORDER BY r.created_at DESC
  `).all(product_id);

  const stats = db.prepare(`
    SELECT COUNT(*) as count, ROUND(AVG(rating * 1.0), 1) as average
    FROM reviews WHERE product_id = ? AND is_approved = 1
  `).get(product_id);

  const parsed = reviews.map(r => ({
    ...r,
    photos: r.photos_raw ? r.photos_raw.split(',') : [],
    photos_raw: undefined
  }));

  // Vérifier si l'utilisateur connecté a acheté ce produit
  let has_purchased = false;
  let already_reviewed = false;
  const authHeader = req.headers.authorization;
  if (authHeader) {
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET || 'tea_secret_2024');
      const userId = decoded.id;
      // Chercher dans les commandes payées/livrées de cet utilisateur
      const userOrders = db.prepare(
        "SELECT items FROM orders WHERE user_id = ? AND status IN ('paid','shipped','delivered')"
      ).all(userId);
      // Admin = always considered as having purchased
      const isAdminUser = db.prepare("SELECT role FROM users WHERE id = ?").get(decoded.id);
      if (isAdminUser?.role === 'admin') {
        has_purchased = true;
      } else {
        has_purchased = userOrders.some(order => {
          try {
            const items = JSON.parse(order.items || '[]');
            return items.some(i => String(i.product_id) === String(product_id));
          } catch { return false; }
        });
      }
      already_reviewed = !!db.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').get(product_id, userId);
    } catch {}
  }

  res.json({ reviews: parsed, stats: { count: stats.count, average: stats.average || 0 }, has_purchased, already_reviewed });
});

// ─── POST /api/reviews ──────────────────────────────────────
// Authentifié : poster un avis avec jusqu'à 3 photos
router.post('/', requireAuth, upload.array('photos', 3), async (req, res) => {
  const { product_id, rating, comment } = req.body;
  const user_id = req.user.id;

  if (!product_id || !rating) return res.status(400).json({ error: 'product_id et rating requis' });
  const r = parseInt(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });

  // Vérifier que le produit existe
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  // Les admins peuvent commenter sans avoir acheté
  const isAdmin = req.user.role === 'admin';
  
  if (!isAdmin) {
    // Vérifier que l'utilisateur a acheté ce produit
    const userOrders = db.prepare(
      "SELECT items FROM orders WHERE user_id = ? AND status IN ('paid','shipped','delivered')"
    ).all(user_id);
    const hasBought = userOrders.some(order => {
      try {
        const items = JSON.parse(order.items || '[]');
        return items.some(i => String(i.product_id) === String(product_id));
      } catch { return false; }
    });
    if (!hasBought) return res.status(403).json({ error: 'Vous devez avoir acheté ce produit pour laisser un avis.' });
  }

  // Vérifier l'unicité
  const existing = db.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').get(product_id, user_id);
  if (existing) return res.status(409).json({ error: 'Vous avez déjà laissé un avis sur ce produit.' });

  // Migration: add verified_purchase column if missing
  try { db.exec('ALTER TABLE reviews ADD COLUMN verified_purchase INTEGER DEFAULT 0'); } catch {}

  const result = db.prepare(
    'INSERT INTO reviews (product_id, user_id, rating, comment, verified_purchase) VALUES (?, ?, ?, ?, 1)'
  ).run(product_id, user_id, r, comment?.trim() || null);

  const reviewId = result.lastInsertRowid;

  // Enregistrer les photos si présentes
  if (req.files && req.files.length > 0) {
    const localDir = path.join(__dirname, '../../client/assets/images/reviews');
    const insertPhoto = db.prepare('INSERT INTO review_photos (review_id, photo_url) VALUES (?, ?)');
    for (const file of req.files) {
      try {
        const url = await uploadImage(file.buffer, file.originalname, 'reviews', localDir);
        insertPhoto.run(reviewId, url);
      } catch(imgErr) {
        console.error('[review photo upload]', imgErr.message);
      }
    }
  }

  // +10 points fidélité pour l'avis
  awardLoyalty(req.user.id, 'review', 10, String(product_id));

  res.status(201).json({
    id: reviewId,
    message: 'Avis enregistré ! Il sera visible après validation. +10 points fidélité 🌸',
    pending: true
  });
});

// ─── GET /api/reviews/admin ─────────────────────────────────
// Admin : tous les avis avec photos
router.get('/admin', requireAdmin, (req, res) => {
  try {
    // Migration défensive : s'assurer que verified_purchase existe
    try { db.exec('ALTER TABLE reviews ADD COLUMN verified_purchase INTEGER DEFAULT 0'); } catch {}

    const reviews = db.prepare(`
      SELECT r.id, r.rating, r.comment, r.is_approved, r.created_at,
             COALESCE(r.verified_purchase, 0) as verified_purchase,
             u.first_name, u.last_name, u.email,
             p.name AS product_name, p.id AS product_id,
             GROUP_CONCAT(rp.photo_url) AS photos_raw
      FROM reviews r
      JOIN users u ON u.id = r.user_id
      JOIN products p ON p.id = r.product_id
      LEFT JOIN review_photos rp ON rp.review_id = r.id
      GROUP BY r.id
      ORDER BY r.is_approved ASC, r.created_at DESC
    `).all();

    const parsed = reviews.map(r => ({
      ...r,
      photos: r.photos_raw ? r.photos_raw.split(',') : [],
      photos_raw: undefined
    }));

    res.json(parsed);
  } catch (e) {
    console.error('[GET /reviews/admin]', e.message);
    res.status(500).json({ error: 'Erreur lors du chargement des avis : ' + e.message });
  }
});

// ─── PUT /api/reviews/:id/approve ──────────────────────────
router.put('/:id/approve', requireAdmin, (req, res) => {
  const { id } = req.params;
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Avis introuvable' });
  db.prepare('UPDATE reviews SET is_approved = 1 WHERE id = ?').run(id);
  res.json({ message: 'Avis approuvé' });
});

// ─── PUT /api/reviews/:id/reject ───────────────────────────
router.put('/:id/reject', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE reviews SET is_approved = 0 WHERE id = ?').run(id);
  res.json({ message: 'Avis rejeté' });
});

// ─── DELETE /api/reviews/:id ────────────────────────────────
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Avis introuvable' });

  // Supprimer les fichiers photos du disque
  const photos = db.prepare('SELECT photo_url FROM review_photos WHERE review_id = ?').all(id);
  for (const p of photos) {
    const filePath = path.join(__dirname, '../../client', p.photo_url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ message: 'Avis supprimé' });
});


// ─── GET /api/reviews/global-stats ──────────────────────────
// Statistiques globales pour le header (étoiles du site)
router.get('/global-stats', (req, res) => {
  try {
    const stats = db.prepare(`
      SELECT COUNT(*) as count, ROUND(AVG(rating * 1.0), 1) as average
      FROM reviews WHERE is_approved = 1
    `).get();
    res.json({ count: stats.count || 0, average: stats.average || 0 });
  } catch (e) {
    res.json({ count: 0, average: 0 });
  }
});

module.exports = router;
