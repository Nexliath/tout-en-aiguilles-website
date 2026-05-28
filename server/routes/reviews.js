const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// ─── GET /api/reviews?product_id=X ──────────────────────────
// Public : retourne les avis approuvés pour un produit
router.get('/', (req, res) => {
  const { product_id } = req.query;
  if (!product_id) return res.status(400).json({ error: 'product_id requis' });

  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.created_at,
           u.first_name, u.last_name
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ? AND r.is_approved = 1
    ORDER BY r.created_at DESC
  `).all(product_id);

  const stats = db.prepare(`
    SELECT COUNT(*) as count, ROUND(AVG(rating * 1.0), 1) as average
    FROM reviews WHERE product_id = ? AND is_approved = 1
  `).get(product_id);

  res.json({ reviews, stats: { count: stats.count, average: stats.average || 0 } });
});

// ─── POST /api/reviews ──────────────────────────────────────
// Authentifié : poster un avis (un seul par utilisateur par produit)
router.post('/', requireAuth, (req, res) => {
  const { product_id, rating, comment } = req.body;
  const user_id = req.user.id;

  if (!product_id || !rating) return res.status(400).json({ error: 'product_id et rating requis' });
  const r = parseInt(rating);
  if (r < 1 || r > 5) return res.status(400).json({ error: 'Note entre 1 et 5' });

  // Vérifier que le produit existe
  const product = db.prepare('SELECT id FROM products WHERE id = ? AND is_active = 1').get(product_id);
  if (!product) return res.status(404).json({ error: 'Produit introuvable' });

  // Vérifier l'unicité
  const existing = db.prepare('SELECT id FROM reviews WHERE product_id = ? AND user_id = ?').get(product_id, user_id);
  if (existing) return res.status(409).json({ error: 'Vous avez déjà laissé un avis sur ce produit.' });

  const result = db.prepare(
    'INSERT INTO reviews (product_id, user_id, rating, comment) VALUES (?, ?, ?, ?)'
  ).run(product_id, user_id, r, comment?.trim() || null);

  res.status(201).json({
    id: result.lastInsertRowid,
    message: 'Avis enregistré ! Il sera visible après validation.',
    pending: true
  });
});

// ─── GET /api/reviews/admin ─────────────────────────────────
// Admin : tous les avis (approuvés + en attente)
router.get('/admin', requireAdmin, (req, res) => {
  const reviews = db.prepare(`
    SELECT r.id, r.rating, r.comment, r.is_approved, r.created_at,
           u.first_name, u.last_name, u.email,
           p.name AS product_name, p.id AS product_id
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    JOIN products p ON p.id = r.product_id
    ORDER BY r.is_approved ASC, r.created_at DESC
  `).all();
  res.json(reviews);
});

// ─── PUT /api/reviews/:id/approve ──────────────────────────
// Admin : approuver un avis
router.put('/:id/approve', requireAdmin, (req, res) => {
  const { id } = req.params;
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Avis introuvable' });

  db.prepare('UPDATE reviews SET is_approved = 1 WHERE id = ?').run(id);
  res.json({ message: 'Avis approuvé' });
});

// ─── PUT /api/reviews/:id/reject ───────────────────────────
// Admin : rejeter (remettre en attente) un avis
router.put('/:id/reject', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE reviews SET is_approved = 0 WHERE id = ?').run(id);
  res.json({ message: 'Avis rejeté' });
});

// ─── DELETE /api/reviews/:id ────────────────────────────────
// Admin : supprimer un avis
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const review = db.prepare('SELECT id FROM reviews WHERE id = ?').get(id);
  if (!review) return res.status(404).json({ error: 'Avis introuvable' });

  db.prepare('DELETE FROM reviews WHERE id = ?').run(id);
  res.json({ message: 'Avis supprimé' });
});

module.exports = router;
