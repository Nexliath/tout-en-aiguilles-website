const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Init table
db.exec(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    endpoint TEXT UNIQUE NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

let webpush = null;
function getWebPush() {
  if (webpush) return webpush;
  try {
    webpush = require('web-push');
    const pub  = process.env.VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    if (pub && priv) {
      webpush.setVapidDetails('mailto:tout.en.aiguilles@gmail.com', pub, priv);
    }
  } catch { webpush = null; }
  return webpush;
}

// GET /api/push/vapid-public — retourne la clé publique VAPID
router.get('/vapid-public', (req, res) => {
  const key = process.env.VAPID_PUBLIC_KEY || null;
  res.json({ publicKey: key });
});

// POST /api/push/subscribe — enregistrer une subscription
router.post('/subscribe', requireAuth, (req, res) => {
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ error: 'Données manquantes' });
  try {
    db.prepare(`INSERT OR REPLACE INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES (?, ?, ?, ?)`).run(req.user.id, endpoint, keys.p256dh, keys.auth);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/push/send — envoi admin (nouvelle commande, etc.)
router.post('/send', requireAdmin, async (req, res) => {
  const wp = getWebPush();
  if (!wp) return res.status(503).json({ error: 'Web Push non configuré (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY manquants)' });
  const { title, body, url, userIds } = req.body;
  let subs;
  if (userIds && userIds.length) {
    subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${userIds.map(() => '?').join(',')})`)
      .all(...userIds);
  } else {
    subs = db.prepare('SELECT * FROM push_subscriptions').all();
  }
  const payload = JSON.stringify({ title, body, url: url || '/' });
  let sent = 0, failed = 0;
  await Promise.allSettled(subs.map(async s => {
    try {
      await wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint);
    }
  }));
  res.json({ sent, failed, total: subs.length });
});

// Helper : notifier les admins (nouvelle commande)
async function notifyAdmins(title, body, url) {
  const wp = getWebPush();
  if (!wp) return;
  const adminUsers = db.prepare("SELECT id FROM users WHERE role = 'admin'").all();
  if (!adminUsers.length) return;
  const ids = adminUsers.map(u => u.id);
  const subs = db.prepare(`SELECT * FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`)
    .all(...ids);
  const payload = JSON.stringify({ title, body, url: url || '/gestion-tea/commandes.html' });
  await Promise.allSettled(subs.map(s =>
    wp.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      .catch(e => { if (e.statusCode === 410) db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').run(s.endpoint); })
  ));
}

module.exports = router;
module.exports.notifyAdmins = notifyAdmins;
