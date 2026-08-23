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

// Jeton de confirmation (double opt-in) — même principe que unsubToken mais
// avec un sel différent pour ne pas réutiliser le même jeton entre les deux
// usages (confirmer ≠ désabonner).
function confirmToken(email) {
  return crypto.createHmac('sha256', JWT_SECRET).update('confirm:' + String(email).toLowerCase().trim()).digest('hex').slice(0, 32);
}

// Comparaison à temps constant pour éviter une attaque par timing sur les
// jetons ci-dessus (crypto.timingSafeEqual exige des buffers de même
// longueur — nos jetons font toujours 32 caractères hexadécimaux).
function safeTokenEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch { return false; }
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
    confirmed INTEGER NOT NULL DEFAULT 1,
    subscribed_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
} catch(e) {}

// Envoie l'email de confirmation (double opt-in) — gabarit minimal distinct
// de sendOne() (qui suppose un abonné déjà confirmé et ajoute un pied de
// page de désabonnement).
async function sendConfirmationEmail(toEmail, firstName) {
  const confirmUrl = `${BASE()}/api/newsletter/confirm?email=${encodeURIComponent(toEmail)}&token=${confirmToken(toEmail)}`;
  if (!process.env.BREVO_API_KEY) {
    console.log(`📧 [DEMO] Confirmation newsletter → ${toEmail} : ${confirmUrl}`);
    return true;
  }
  const html = `<p>Bonjour ${firstName || ''},</p>
    <p>Merci de votre intérêt pour Tout en Aiguilles ! Confirmez votre inscription à la newsletter en cliquant sur le lien ci-dessous :</p>
    <p><a href="${confirmUrl}" style="background:#c0718a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none">Confirmer mon inscription</a></p>
    <p style="font-size:12px;color:#888">Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — vous ne serez pas inscrit(e).</p>`;
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles', email: senderEmail() },
      to: [{ email: toEmail, name: firstName || toEmail }],
      subject: 'Confirmez votre inscription à la newsletter 🌸',
      htmlContent: html,
      textContent: `Confirmez votre inscription : ${confirmUrl}`,
    }),
  });
  return response.ok;
}

// ─── Abonnement (double opt-in) ──────────────────────────────
// Avant cette correction, is_active=1 était posé immédiatement à l'insu de
// quiconque connaissait un email tiers : n'importe qui pouvait inscrire une
// adresse qu'il ne possède pas, laquelle recevait ensuite de vraies
// campagnes marketing (nuisance + non-conformité RGPD sur le consentement).
// Désormais confirmed=0 par défaut : la campagne n'est envoyée qu'après
// clic sur le lien de confirmation reçu par email.
router.post('/subscribe', asyncRoute(async (req, res) => {
  const { email, first_name } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: 'Email invalide' });
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const existing = db.prepare('SELECT confirmed FROM newsletter_subscribers WHERE email = ?').get(normalizedEmail);
    db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, first_name, confirmed) VALUES (?, ?, 0)')
      .run(normalizedEmail, first_name?.trim() || '');
    db.prepare('UPDATE newsletter_subscribers SET is_active = 1 WHERE email = ?').run(normalizedEmail);
    // On ne renvoie un email de confirmation que si l'abonné n'est pas déjà
    // confirmé — évite de spammer un abonné existant qui retente /subscribe.
    if (!existing || !existing.confirmed) {
      await sendConfirmationEmail(normalizedEmail, first_name?.trim()).catch(() => {});
    }
    res.json({ success: true, pending_confirmation: !existing || !existing.confirmed });
  } catch(e) { res.json({ success: true }); }
}));

// ─── Confirmation d'inscription (double opt-in) ──────────────
router.get('/confirm', (req, res) => {
  const { email, token } = req.query;
  if (!email) return res.status(400).send('Email manquant');
  const decodedEmail = decodeURIComponent(email).toLowerCase();
  if (!token || !safeTokenEqual(token, confirmToken(decodedEmail))) {
    return res.status(403).send('Lien de confirmation invalide ou expiré.');
  }
  try {
    db.prepare('UPDATE newsletter_subscribers SET confirmed = 1, is_active = 1 WHERE email = ?').run(decodedEmail);
  } catch (e) {}
  res.send(`<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Inscription confirmée — Tout en Aiguilles</title>
  <style>body{font-family:Georgia,serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fdf8f5;}
  .box{text-align:center;padding:40px;max-width:400px;}h1{color:#c0718a;}</style></head>
  <body><div class="box"><div style="font-size:3rem;margin-bottom:16px">🌸</div>
  <h1>Inscription confirmée !</h1>
  <p style="color:#888;margin-bottom:24px">Merci, vous recevrez désormais nos actualités et offres.</p>
  <a href="${BASE()}" style="background:#c0718a;color:white;padding:10px 24px;border-radius:8px;text-decoration:none;font-size:.9rem">Retour à la boutique</a>
  </div></body></html>`);
});

// ─── Désabonnement (lien dans les emails) ───────────────────
router.get('/unsubscribe', (req, res) => {
  const { email, token } = req.query;
  if (!email) return res.status(400).send('Email manquant');
  const decodedEmail = decodeURIComponent(email).toLowerCase();
  if (!token || !safeTokenEqual(token, unsubToken(decodedEmail))) {
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
// limit/offset optionnels — par défaut on renvoie tout (l'admin actuel
// calcule ses stats côté client sur la liste complète) ; un appelant peut
// explicitement paginer via ?limit=&offset=.
router.get('/subscribers', requireAdmin, (req, res) => {
  try {
    const { limit: limitRaw, offset: offsetRaw } = req.query;
    if (limitRaw === undefined) {
      return res.json(db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1 ORDER BY subscribed_at DESC').all());
    }
    let limit = parseInt(limitRaw, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    limit = Math.min(limit, 500);
    let offset = parseInt(offsetRaw, 10);
    if (!Number.isFinite(offset) || offset < 0) offset = 0;
    const subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1 ORDER BY subscribed_at DESC LIMIT ? OFFSET ?').all(limit, offset);
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
    const campaigns = db.prepare('SELECT id, subject, recipients, errors, status, sent_at FROM newsletter_campaigns ORDER BY sent_at DESC LIMIT 50').all();
    res.json(campaigns);
  } catch (e) { res.json([]); }
});

// Nombre d'envois traités en parallèle par lot — assez pour accélérer
// nettement l'envoi sur une grosse liste, sans risquer de saturer l'API
// Brevo (pas de garantie de rate-limit documentée côté Brevo, mieux vaut
// rester prudent).
const NEWSLETTER_BATCH_SIZE = 5;

// ─── Envoi newsletter (admin) ───────────────────────────────
// Répond immédiatement à l'admin (statut "en cours" persisté en base) puis
// poursuit l'envoi par lots en arrière-plan — avant cette correction,
// l'envoi complet à toute la liste se faisait email par email DANS la
// requête HTTP : sur une grosse liste de subscribers, ça risquait de
// dépasser le timeout du proxy/navigateur, laissant l'admin sans aucune
// visibilité sur l'avancement réel côté serveur (qui continuait pourtant).
router.post('/send', requireAdmin, asyncRoute(async (req, res) => {
  const { subject, html_content } = req.body;
  if (!subject || !html_content) return res.status(400).json({ error: 'Sujet et contenu requis' });

  let subs = [];
  try { subs = db.prepare('SELECT * FROM newsletter_subscribers WHERE is_active = 1 AND confirmed = 1').all(); } catch(e) {}
  if (!subs.length) return res.json({ success: true, sent: 0, errors: 0, total: 0, queued: false });

  const campaignResult = db.prepare(
    "INSERT INTO newsletter_campaigns (subject, html_content, recipients, errors, status) VALUES (?, ?, 0, 0, 'sending')"
  ).run(subject, html_content);
  const campaignId = campaignResult.lastInsertRowid;

  res.json({ success: true, queued: true, total: subs.length });

  (async () => {
    let sent = 0, errors = 0;
    for (let i = 0; i < subs.length; i += NEWSLETTER_BATCH_SIZE) {
      const batch = subs.slice(i, i + NEWSLETTER_BATCH_SIZE);
      const results = await Promise.all(batch.map(sub =>
        sendOne(sub.email, sub.first_name, subject, html_content).catch(() => false)
      ));
      results.forEach(ok => { if (ok) sent++; else errors++; });
    }
    console.log(`📧 Newsletter envoyée : ${sent} succès, ${errors} erreurs`);
    try {
      db.prepare("UPDATE newsletter_campaigns SET recipients = ?, errors = ?, status = 'completed' WHERE id = ?")
        .run(sent, errors, campaignId);
    } catch (e) {}
    logActivity(req.user, 'Newsletter envoyée', `"${subject}" → ${sent} destinataire(s)`);
  })().catch(err => console.error('Erreur envoi newsletter (arrière-plan):', err.message));
}));

module.exports = router;
