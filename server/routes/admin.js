const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// ─── GET /api/admin/users — liste tous les utilisateurs ─────
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, email, first_name, last_name, role, email_verified, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// ─── PUT /api/admin/users/:id/role — changer le rôle ────────
router.put('/users/:id/role', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide (admin ou user)' });
  }

  // Empêcher l'admin de se rétrograder lui-même
  if (parseInt(id) === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'Vous ne pouvez pas vous rétrograder vous-même' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  res.json({ success: true });
});

// ─── DELETE /api/admin/users/:id — supprimer un compte ──────
router.delete('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

module.exports = router;
