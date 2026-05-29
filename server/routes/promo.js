const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Valider un code promo
router.get('/validate', (req, res) => {
  const { code, total } = req.query;
  if (!code) return res.status(400).json({ valid: false, message: 'Code manquant' });
  const orderTotal = parseFloat(total) || 0;
  const promo = db.prepare('SELECT * FROM promo_codes WHERE code = ? COLLATE NOCASE AND is_active = 1').get(code.trim());
  if (!promo) return res.json({ valid: false, message: 'Code promo invalide ou expiré' });
  if (promo.expires_at && new Date(promo.expires_at) < new Date()) return res.json({ valid: false, message: 'Code promo expiré' });
  if (promo.max_uses !== null && promo.uses_count >= promo.max_uses) return res.json({ valid: false, message: 'Ce code a atteint sa limite d\'utilisation' });
  if (orderTotal < promo.min_order) return res.json({ valid: false, message: `Commande minimum de ${promo.min_order.toFixed(2)} € requise` });
  const discount_amount = promo.discount_type === 'percent'
    ? Math.min(orderTotal * promo.value / 100, orderTotal)
    : Math.min(promo.value, orderTotal);
  res.json({ valid: true, code: promo.code, discount_type: promo.discount_type, value: promo.value, discount_amount: Math.round(discount_amount * 100) / 100, code_id: promo.id, description: promo.description });
});

// Admin CRUD
router.get('/', requireAdmin, (req, res) => res.json(db.prepare('SELECT * FROM promo_codes ORDER BY created_at DESC').all()));

router.post('/', requireAdmin, (req, res) => {
  const { code, discount_type, value, min_order, max_uses, expires_at, description } = req.body;
  if (!code || !value) return res.status(400).json({ error: 'Code et valeur requis' });
  try {
    const r = db.prepare('INSERT INTO promo_codes (code, discount_type, value, min_order, max_uses, expires_at, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(code.trim().toUpperCase(), discount_type || 'percent', parseFloat(value), parseFloat(min_order) || 0, max_uses ? parseInt(max_uses) : null, expires_at || null, description || '');
    res.status(201).json({ success: true, id: r.lastInsertRowid });
  } catch(e) { res.status(400).json({ error: 'Ce code existe déjà' }); }
});

router.put('/:id', requireAdmin, (req, res) => {
  const { is_active, description, max_uses, expires_at } = req.body;
  db.prepare('UPDATE promo_codes SET is_active=?, description=?, max_uses=?, expires_at=? WHERE id=?')
    .run(is_active !== undefined ? (is_active ? 1 : 0) : undefined, description, max_uses || null, expires_at || null, req.params.id);
  res.json({ success: true });
});

router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM promo_codes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
