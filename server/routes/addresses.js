const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/addresses — mes adresses
router.get('/', requireAuth, (req, res) => {
  const addrs = db.prepare(
    'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_primary DESC, created_at ASC'
  ).all(req.user.id);
  res.json(addrs);
});

// POST /api/addresses — ajouter une adresse
router.post('/', requireAuth, (req, res) => {
  const { label, first_name, last_name, address, city, postal_code, country, is_primary } = req.body;
  if (!address?.trim() || !city?.trim() || !postal_code?.trim())
    return res.status(400).json({ error: 'Adresse, ville et code postal requis' });

  // Si on définit comme principale, retirer le flag des autres
  if (is_primary) {
    db.prepare('UPDATE addresses SET is_primary = 0 WHERE user_id = ?').run(req.user.id);
  }

  // Si c'est la première adresse, la mettre en principale automatiquement
  const count = db.prepare('SELECT COUNT(*) as n FROM addresses WHERE user_id = ?').get(req.user.id).n;
  const shouldBePrimary = is_primary || count === 0 ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO addresses (user_id, label, first_name, last_name, address, city, postal_code, country, is_primary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.id,
    label?.trim() || 'Maison',
    first_name?.trim() || '', last_name?.trim() || '',
    address.trim(), city.trim(), postal_code.trim(),
    country?.trim() || 'France',
    shouldBePrimary
  );
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

// PUT /api/addresses/:id — modifier une adresse
router.put('/:id', requireAuth, (req, res) => {
  const addr = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!addr) return res.status(404).json({ error: 'Adresse introuvable' });
  const { label, first_name, last_name, address, city, postal_code, country } = req.body;
  db.prepare(`
    UPDATE addresses SET label=?, first_name=?, last_name=?, address=?, city=?, postal_code=?, country=?
    WHERE id = ? AND user_id = ?
  `).run(
    label?.trim() ?? addr.label,
    first_name?.trim() ?? addr.first_name, last_name?.trim() ?? addr.last_name,
    address?.trim() ?? addr.address, city?.trim() ?? addr.city,
    postal_code?.trim() ?? addr.postal_code, country?.trim() ?? addr.country,
    req.params.id, req.user.id
  );
  res.json({ success: true });
});

// PUT /api/addresses/:id/primary — définir comme principale
router.put('/:id/primary', requireAuth, (req, res) => {
  const addr = db.prepare('SELECT id FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!addr) return res.status(404).json({ error: 'Adresse introuvable' });
  db.prepare('UPDATE addresses SET is_primary = 0 WHERE user_id = ?').run(req.user.id);
  db.prepare('UPDATE addresses SET is_primary = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// DELETE /api/addresses/:id — supprimer une adresse
router.delete('/:id', requireAuth, (req, res) => {
  const addr = db.prepare('SELECT * FROM addresses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!addr) return res.status(404).json({ error: 'Adresse introuvable' });
  db.prepare('DELETE FROM addresses WHERE id = ?').run(req.params.id);
  // Si c'était l'adresse principale, en promouvoir une autre
  if (addr.is_primary) {
    const next = db.prepare('SELECT id FROM addresses WHERE user_id = ? ORDER BY created_at ASC LIMIT 1').get(req.user.id);
    if (next) db.prepare('UPDATE addresses SET is_primary = 1 WHERE id = ?').run(next.id);
  }
  res.json({ success: true });
});

module.exports = router;
