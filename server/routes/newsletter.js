const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();
const BASE = () => process.env.BASE_URL || 'https://tout-en-aiguilles.com';

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
  const { email } = req.query;
  if (!email) return res.status(400).send('Email manquant');
  try {
    db.prepare('UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?').run(decodeURIComponent(email).toLowerCase());
    // Aussi mettre à jour newsletter_opt_out dans users si l'email correspond
    db.prepare('UPDATE users SET newsletter_opt_out = 1 WHERE email = ?').run(decodeURIComponent(email).toLowerCase());
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

// ─── Envoi newsletter (admin) ───────────────────────────────
router.post('/send', requireAdmin, async (req, res) => {
  const { subject, html_content } = req.body;
  if (!subject || !html_content) return res.status(400).json({ error: 'Sujet et contenu requis' });

  let subs = [];
  try { subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1').all(); } catch(e) {}
  if (!subs.length) return res.json({ success: true, sent: 0, errors: 0, total: 0 });

  const senderEmail = process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] || process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';
  let sent = 0, errors = 0;

  for (const sub of subs) {
    try {
      if (!process.env.BREVO_API_KEY) { sent++; continue; }
      const unsubUrl = `${BASE()}/api/newsletter/unsubscribe?email=${encodeURIComponent(sub.email)}`;
      // Ajouter footer discret de désabonnement
      const fullHtml = `${html_content}
        <div style="margin-top:32px;padding-top:16px;border-top:1px solid #f0e8e0;text-align:center;font-size:11px;color:#b8a090">
          Vous recevez cet email car vous êtes abonné(e) aux actualités de Tout en Aiguilles.<br>
          <a href="${unsubUrl}" style="color:#b8a090;text-decoration:underline">Se désabonner</a>
        </div>`;
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: 'Tout en Aiguilles', email: senderEmail },
          to: [{ email: sub.email, name: sub.first_name || sub.email }],
          subject,
          htmlContent: fullHtml,
          textContent: `${subject}\n\nPour vous désabonner : ${unsubUrl}`,
          headers: { 'List-Unsubscribe': `<${unsubUrl}>` },
        }),
      });
      if (response.ok) sent++; else errors++;
    } catch(e) { errors++; }
  }
  console.log(`📧 Newsletter envoyée : ${sent} succès, ${errors} erreurs`);
  res.json({ success: true, sent, errors, total: subs.length });
});

module.exports = router;
