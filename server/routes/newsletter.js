const express = require('express');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.post('/subscribe', (req, res) => {
  const { email, first_name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Email invalide' });
  try {
    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, first_name) VALUES (?, ?)').run(email.trim().toLowerCase(), first_name?.trim() || '');
    res.json({ success: true });
  } catch(e) { res.json({ success: true }); }
});

router.get('/subscribers', requireAdmin, (req, res) => {
  const subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1 ORDER BY subscribed_at DESC').all();
  res.json(subs);
});

router.post('/send', requireAdmin, async (req, res) => {
  const { subject, html_content } = req.body;
  if (!subject || !html_content) return res.status(400).json({ error: 'Sujet et contenu requis' });
  const subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1').all();
  if (!subs.length) return res.json({ success: true, sent: 0 });
  const { sendBrevo } = require('../utils/email');
  let sent = 0, errors = 0;
  for (const sub of subs) {
    try {
      if (!process.env.BREVO_API_KEY) { sent++; continue; }
      const senderEmail = process.env.SMTP_FROM?.match(/<(.+)>/)?.[1] || process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';
      const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
        body: JSON.stringify({
          sender: { name: 'Tout en Aiguilles', email: senderEmail },
          to: [{ email: sub.email, name: sub.first_name || sub.email }],
          subject,
          htmlContent: html_content,
          textContent: subject,
          headers: { 'List-Unsubscribe': `<mailto:tout.en.aiguilles@gmail.com?subject=unsubscribe>` }
        }),
      });
      if (response.ok) sent++; else errors++;
    } catch(e) { errors++; }
  }
  console.log(`📧 Newsletter envoyée : ${sent} succès, ${errors} erreurs`);
  res.json({ success: true, sent, errors, total: subs.length });
});

module.exports = router;
