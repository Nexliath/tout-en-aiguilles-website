const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');

const router = express.Router();

// ─── GET /api/admin/activity-log — journal d'activité récent ─
router.get('/activity-log', requireAdmin, (req, res) => {
  const logs = db.prepare('SELECT * FROM admin_activity_log ORDER BY created_at DESC LIMIT 100').all();
  res.json(logs);
});

// ─── GET /api/admin/cart-sessions — paniers (abandonnés / convertis) ─
router.get('/cart-sessions', requireAdmin, (req, res) => {
  const sessions = db.prepare(`
    SELECT * FROM cart_sessions
    WHERE items_json IS NOT NULL AND items_json != '[]'
    ORDER BY updated_at DESC LIMIT 200
  `).all().map(s => ({ ...s, items: JSON.parse(s.items_json || '[]') }));
  res.json(sessions);
});

// ─── GET /api/admin/users — liste tous les utilisateurs ─────
router.get('/users', requireAdmin, (req, res) => {
  const users = db.prepare(
    'SELECT id, email, first_name, last_name, username, role, email_verified, avatar_url, created_at FROM users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// ─── PUT /api/admin/users/:id/role — changer le rôle ────────
router.put('/users/:id/role', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  // 'customer' est la valeur réellement utilisée partout ailleurs (schéma,
  // inscription) — 'user' n'existe nulle part dans la base et créerait des
  // comptes orphelins pour tout filtre futur sur role = 'customer'.
  if (!['admin', 'customer'].includes(role)) {
    return res.status(400).json({ error: 'Rôle invalide (admin ou customer)' });
  }

  // Empêcher l'admin de se rétrograder lui-même
  if (parseInt(id) === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: 'Vous ne pouvez pas vous rétrograder vous-même' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  logActivity(req.user, 'Rôle utilisateur modifié', `#${id} → ${role}`);
  res.json({ success: true });
});

// ─── DELETE /api/admin/users/:id — supprimer un compte ──────
router.delete('/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  }

  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  // orders.user_id n'a pas de ON DELETE CASCADE/SET NULL (volontaire, pour
  // ne jamais perdre une commande) — sans ce détachement, PRAGMA
  // foreign_keys=ON bloque la suppression de tout client ayant commandé.
  db.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logActivity(req.user, 'Utilisateur supprimé', `#${id} (${user.email || ''})`);
  res.json({ success: true });
});

module.exports = router;
