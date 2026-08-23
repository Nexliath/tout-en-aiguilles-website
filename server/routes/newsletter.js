const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { processAndSaveImage } = require('../utils/imageProcess');
const { asyncRoute } = require('../middleware/asyncRoute');
const router = express.Router();
const BASE = () => process.env.BASE_URL || 'https://tout-en-aiguilles.com';
const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';

// Jeton de désabonnement dérivé de l'email — évite qu'une simple image
// cachée (<img src=".../unsubscribe?email=victime@...">) sur un site tiers
// puisse désabonner n'importe quel email connu (CSRF sur une action GET).
function unsubToken(email) {
  return crypto.createHmac('sha256', JWT_SECRET).update(String(email).toLowerCase().trim()).digest('hex').slice(0, 32);
}

// Upload d'images pour le contenu de newsletter — en mémoire : redimensionnées
// et compressées (sharp) avant écriture sur disque, voir saveNewsletterImage().
const NL_IMG_DIR = path.join(__dirname, '../../client/assets/images/newsletter');
const nlUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
async function saveNewsletterImage(file) {
  const name = await processAndSaveImage(file.buffer, NL_IMG_DIR, `nl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  return `/assets/images/newsletter/${name}`;
}

// S'assurer que la table existe (sécurité si migration pas encore jouée)
try {
  db.exec(`CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_name TEXT DEFAULT '',
    source TEXT DEFAULT 'website',
    is_active INTEGER DEFAULT 1,
    subscribed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
} catch(e) {}

// ─── Abonnement ─────────────────────────────────────────────
router.post('/subscribe', (req, res) => {
  const { email, first_name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Email invalide' });
  try {
    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, first_name) VALUES (?, ?)').run(email.trim().toLowerCase(), first_name?.trim() || '');
    db.prepare('UPDATE newsletter_subscribers SET is_active = 1 WHERE email = ?').run(email.trim().toLowerCase());
    res.json({ success: true });
  } catch(e) { res.json({ success: true }); }
});

// ─── Désabonnement (lien dans les emails) ───────────────────
router.get('/unsubscribe', (req, res) => {
  const { email, token } = req.query;
  if (!email) return res.status(400).send('Email manquant');
  const decodedEmail = decodeURIComponent(email).toLowerCase();
  if (!token || token !== unsubToken(decodedEmail)) {
    return res.status(403).send('Lien de désabonnement invalide ou expiré. Vous pouvez gérer vos préférences newsletter depuis votre compte.');
  }
  try {
    db.prepare('UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?').run(decodedEmail);
    // Aussi mettre à jour newsletter_opt_out dans users si l'email correspond
    db.prepare('UPDATE users SET newsletter_opt_out = 1 WHERE email = ?').run(decodedEmail);
  } catch(e) {}
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Désabonnement — Tout en Aiguilles</title>
  <style>body{font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fdf8f5;}
  .box{text-align:center;padding:40px;max-width:400px;}h1{color:#c0718a;}</style></head>
  <body><div class="box"><div style="font-size:3rem;margin-bottom:16px">🌸</div>
  <h1>Vous êtes désabonné(e)</h1>
  <p style="color:#888;margin-bottom:24px">Vous ne recevrez plus nos newsletters. Vous pouvez vous réabonner à tout moment depuis votre profil.</p>
  <a href="${BASE()}" style="background:#c0718a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:.9rem">Retour à la boutique</a>
  </div></body></html>`);
});

// ─── Liste subscribers (admin) ──────────────────────────────
router.get('/subscribers', requireAdmin, (req, res) => {
  try {
    const subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1 ORDER BY subscribed_at DESC').all();
    res.json(subs);
  } catch(e) {
    res.json([]);
  }
});

const senderEmail = () => process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] || process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';

async function sendOne(toEmail, toName, subject, html_content) {
  const unsubUrl = `${BASE()}/api/newsletter/unsubscribe?email=${encodeURIComponent(toEmail)}&token=${unsubToken(toEmail)}`;
  const fullHtml = `${html_content}
    <div style="margin-top:32px;padding-top:16px;border-top:1px solid #f0e8e0;text-align:center;font-size:11px;color:#b8a090">
      Vous recevez cet email car vous êtes abonné(e) aux actualités de Tout en Aiguilles.<br>
      <a href="${unsubUrl}" style="color:#b8a090;text-decoration:underline">Se désabonner</a>
    </div>`;
  if (!process.env.BREVO_API_KEY) return true; // pas de clé configurée → simulé succès (dev)
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles', email: senderEmail() },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: fullHtml,
      textContent: `${subject}\n\nPour vous désabonner : ${unsubUrl}`,
      headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
    }),
  });
  return response.ok;
}

// ─── Upload d'image pour le contenu newsletter (admin) ──────
router.post('/upload-image', requireAdmin, nlUpload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image requise' });
  res.json({ url: await saveNewsletterImage(req.file) });
}));

// ─── Envoi d'un test à soi-même (admin) ─────────────────────
router.post('/send-test', requireAdmin, async (req, res) => {
  const { subject, html_content } = req.body;
  if (!subject || !html_content) return res.status(400).json({ error: 'Sujet et contenu requis' });
  try {
    const ok = await sendOne(req.user.email, req.user.first_name || 'Test', `[TEST] ${subject}`, html_content);
    res.json({ success: ok });
  } catch (e) { res.status(500).json({ error: 'Erreur lors de l\'envoi du test' }); }
});

// ─── Historique des campagnes (admin) ───────────────────────
router.get('/campaigns', requireAdmin, (req, res) => {
  try {
    const campaigns = db.prepare('SELECT id, subject, recipients, errors, sent_at FROM newsletter_campaigns ORDER BY sent_at DESC LIMIT 50').all();
    res.json(campaigns);
  } catch (e) { res.json([]); }
});

// ─── Envoi newsletter (admin) ───────────────────────────────
router.post('/send', requireAdmin, async (req, res) => {
  const { subject, html_content } = req.body;
  if (!subject || !html_content) return res.status(400).json({ error: 'Sujet et contenu requis' });

  let subs = [];
  try { subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1').all(); } catch(e) {}
  if (!subs.length) return res.json({ success: true, sent: 0, errors: 0, total: 0 });

  let sent = 0, errors = 0;
  for (const sub of subs) {
    try {
      const ok = await sendOne(sub.email, sub.first_name, subject, html_content);
      if (ok) sent++; else errors++;
    } catch(e) { errors++; }
  }
  console.log(`📧 Newsletter envoyée : ${sent} succès, ${errors} erreurs`);
  try {
    db.prepare('INSERT INTO newsletter_campaigns (subject, html_content, recipients, errors) VALUES (?, ?, ?, ?)')
      .run(subject, html_content, sent, errors);
  } catch (e) {}
  logActivity(req.user, 'Newsletter envoyée', `"${subject}" → ${sent} destinataire(s)`);
  res.json({ success: true, sent, errors, total: subs.length });
});

module.exports = router;
