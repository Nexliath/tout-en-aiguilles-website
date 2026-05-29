const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Init table
db.exec(`
  CREATE TABLE IF NOT EXISTS loyalty_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    points INTEGER NOT NULL DEFAULT 0,
    action TEXT NOT NULL,
    reference TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS loyalty_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);
// Default config
const defaults = [
  ['points_per_euro', '1'],
  ['points_for_review', '10'],
  ['points_for_signup', '20'],
  ['points_per_referral', '50'],
  ['redeem_rate', '100'],   // 100 pts = 1€
  ['min_redeem', '500'],    // min 500 pts pour utiliser
];
const insertCfg = db.prepare('INSERT OR IGNORE INTO loyalty_config (key, value) VALUES (?, ?)');
defaults.forEach(([k, v]) => insertCfg.run(k, v));

function getConfig() {
  const rows = db.prepare('SELECT key, value FROM loyalty_config').all();
  return Object.fromEntries(rows.map(r => [r.key, Number(r.value)]));
}

function getUserPoints(userId) {
  const row = db.prepare('SELECT COALESCE(SUM(points), 0) as total FROM loyalty_points WHERE user_id = ?').get(userId);
  return row ? row.total : 0;
}

// GET /api/loyalty/me
router.get('/me', requireAuth, (req, res) => {
  const userId = req.user.id;
  const points = getUserPoints(userId);
  const history = db.prepare('SELECT * FROM loyalty_points WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
  const cfg = getConfig();
  const euroValue = Math.floor(points / cfg.redeem_rate);
  res.json({ points, euroValue, history, config: cfg });
});

// POST /api/loyalty/award — internal use (called by orders/reviews routes)
router.post('/award', requireAuth, (req, res) => {
  const { action, points, reference } = req.body;
  if (!action || !points) return res.status(400).json({ error: 'Champs requis' });
  db.prepare('INSERT INTO loyalty_points (user_id, points, action, reference) VALUES (?, ?, ?, ?)').run(req.user.id, points, action, reference || null);
  res.json({ points: getUserPoints(req.user.id) });
});

// POST /api/loyalty/redeem — convertir des points en code promo
router.post('/redeem', requireAuth, (req, res) => {
  const userId = req.user.id;
  const cfg = getConfig();
  const currentPoints = getUserPoints(userId);
  if (currentPoints < cfg.min_redeem) return res.status(400).json({ error: `Il vous faut au moins ${cfg.min_redeem} points pour obtenir une réduction.` });
  
  const { points_to_use } = req.body;
  const pts = Math.min(Number(points_to_use) || cfg.min_redeem, currentPoints);
  const euroValue = Math.floor(pts / cfg.redeem_rate);
  if (euroValue < 1) return res.status(400).json({ error: 'Points insuffisants' });

  // Create a promo code
  const code = `FIDELITE${userId}${Date.now()}`;
  db.prepare(`INSERT INTO promo_codes (code, type, value, max_uses, used_count, expires_at, is_active)
    VALUES (?, 'fixed', ?, 1, 0, datetime('now', '+30 days'), 1)`).run(code, euroValue);
  // Deduct points
  db.prepare('INSERT INTO loyalty_points (user_id, points, action, reference) VALUES (?, ?, ?, ?)').run(userId, -pts, 'redeem', code);

  res.json({ code, euroValue, remaining: getUserPoints(userId) });
});

// GET /api/loyalty/admin — vue admin
router.get('/admin', (req, res) => {
  // basic admin check
  const stats = db.prepare(`
    SELECT u.email, u.first_name, u.last_name,
      COALESCE(SUM(lp.points), 0) as total_points
    FROM users u
    LEFT JOIN loyalty_points lp ON lp.user_id = u.id
    GROUP BY u.id ORDER BY total_points DESC LIMIT 50
  `).all();
  res.json(stats);
});

// Helper exporté pour utilisation dans orders/reviews
function awardPoints(userId, action, points, reference) {
  if (!userId) return;
  db.prepare('INSERT INTO loyalty_points (user_id, points, action, reference) VALUES (?, ?, ?, ?)').run(userId, points, action, reference || null);
}

module.exports = router;
module.exports.awardPoints = awardPoints;
module.exports.getUserPoints = getUserPoints;
module.exports.getConfig = getConfig;
