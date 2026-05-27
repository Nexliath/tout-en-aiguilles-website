const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/email');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}
function tokenExpiresAt() {
  const d = new Date();
  d.setHours(d.getHours() + 24);
  return d.toISOString();
}
function sendEmailAsync(email, firstName, token) {
  sendVerificationEmail(email, firstName, token, BASE_URL)
    .catch(err => console.error('Erreur envoi email:', err.message));
}

// ─── POST /api/auth/register ────────────────────────────────
router.post('/register', (req, res) => {
  const { email, password, first_name, last_name } = req.body;

  if (!email || !password || !first_name || !last_name)
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 6 caractères' });

  const existing = db.prepare('SELECT id, email_verified FROM users WHERE email = ?').get(email);

  if (existing) {
    if (!existing.email_verified) {
      // Compte non vérifié → renvoyer l'email
      const token = generateToken();
      db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(existing.id);
      db.prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(existing.id, token, tokenExpiresAt());
      res.json({ pending_verification: true, message: 'Un email de confirmation vous a été renvoyé. Vérifiez votre boîte mail.' });
      sendEmailAsync(email, first_name, token);
      return;
    }
    return res.status(409).json({ error: 'Cet email est déjà utilisé' });
  }

  // Créer le compte (non vérifié)
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, first_name, last_name, email_verified) VALUES (?, ?, ?, ?, 0)'
  ).run(email, hash, first_name, last_name);

  const token = generateToken();
  db.prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(result.lastInsertRowid, token, tokenExpiresAt());

  // Répondre immédiatement puis envoyer l'email en arrière-plan
  res.status(201).json({ pending_verification: true, message: 'Compte créé ! Vérifiez votre boîte mail pour activer votre compte.' });
  sendEmailAsync(email, first_name, token);
});

// ─── GET /api/auth/verify-email?token=xxx ───────────────────
router.get('/verify-email', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token manquant' });

  const row = db.prepare('SELECT * FROM email_verification_tokens WHERE token = ?').get(token);
  if (!row) return res.status(400).json({ error: 'Lien invalide ou déjà utilisé' });

  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM email_verification_tokens WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Lien expiré. Reconnectez-vous pour recevoir un nouveau lien.' });
  }

  db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
  db.prepare('DELETE FROM email_verification_tokens WHERE id = ?').run(row.id);

  const user = db.prepare('SELECT id, email, first_name, last_name, role FROM users WHERE id = ?').get(row.user_id);
  const jwtToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token: jwtToken, user, message: 'Email vérifié avec succès ! Vous êtes maintenant connecté(e).' });
});

// ─── POST /api/auth/resend-verification ─────────────────────
router.post('/resend-verification', (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email requis' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Aucun compte associé à cet email' });
  if (user.email_verified) return res.status(400).json({ error: 'Ce compte est déjà vérifié' });

  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
  const token = generateToken();
  db.prepare('INSERT INTO email_verification_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, tokenExpiresAt());

  res.json({ message: 'Email de confirmation renvoyé !' });
  sendEmailAsync(email, user.first_name, token);
});

// ─── POST /api/auth/login ───────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Veuillez confirmer votre adresse email avant de vous connecter.',
      pending_verification: true,
      email: user.email,
    });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, ...safe } = user;
  res.json({ token, user: safe });
});

// ─── GET /api/auth/me ───────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, first_name, last_name, role, email_verified, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// ─── PUT /api/auth/me ───────────────────────────────────────
router.put('/me', requireAuth, (req, res) => {
  const { first_name, last_name } = req.body;
  db.prepare('UPDATE users SET first_name = ?, last_name = ? WHERE id = ?').run(first_name, last_name, req.user.id);
  res.json({ success: true });
});

// ─── PUT /api/auth/password ─────────────────────────────────
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  if (new_password.length < 6)
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 6 caractères' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

module.exports = router;
