const express = require('express');
const db = require('../db/database');
const router = express.Router();

router.post('/sync', (req, res) => {
  const { session_key, email, items } = req.body;
  if (!session_key) return res.status(400).json({ error: 'session_key requis' });
  const userId = req.headers.authorization ? (() => { try { const jwt = require('jsonwebtoken'); const d = jwt.verify(req.headers.authorization.slice(7), process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024'); return d.id; } catch(e) { return null; } })() : null;
  const itemsJson = JSON.stringify(Array.isArray(items) ? items : []);
  try {
    db.prepare(`INSERT INTO cart_sessions (session_key, user_id, email, items_json, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(session_key) DO UPDATE SET email=excluded.email, items_json=excluded.items_json, updated_at=CURRENT_TIMESTAMP, user_id=COALESCE(excluded.user_id, cart_sessions.user_id)`)
      .run(session_key, userId, email || null, itemsJson);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/sync/:key', (req, res) => {
  db.prepare('UPDATE cart_sessions SET converted = 1 WHERE session_key = ?').run(req.params.key);
  res.json({ success: true });
});

module.exports = router;
