const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// IMPORTANT (sécurité) : ces deux routes nécessitent désormais une vraie
// authentification (requireAuth) et le session_key est TOUJOURS dérivé côté
// serveur de req.user.id, jamais accepté depuis le corps de la requête.
// Avant cette correction, un session_key arbitraire (ex. "user_1") pouvait
// être fourni par n'importe qui sans authentification, permettant d'écrire
// un email arbitraire sur le panier de n'importe quel utilisateur — email
// ensuite affiché sans échappement sur le dashboard admin (widget "Paniers
// abandonnés"), soit une chaîne IDOR → XSS stocké → vol du JWT admin.
router.post('/sync', requireAuth, (req, res) => {
  const { items } = req.body;
  const sessionKey = `user_${req.user.id}`;
  const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
  try {
    db.prepare(`INSERT INTO cart_sessions (session_key, user_id, email, items_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(session_key) DO UPDATE SET email=excluded.email, items_json=excluded.items_json, updated_at=CURRENT_TIMESTAMP, user_id=excluded.user_id`)
      .run(sessionKey, req.user.id, req.user.email || null, itemsJson);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sync/:key', requireAuth, (req, res) => {
  // On ignore req.params.key : un utilisateur ne peut marquer converti QUE
  // son propre panier, jamais celui d'un tiers en devinant sa clé.
  const sessionKey = `user_${req.user.id}`;
  db.prepare('UPDATE cart_sessions SET converted = 1 WHERE session_key = ?').run(sessionKey);
  res.json({ success: true });
});

module.exports = router;
