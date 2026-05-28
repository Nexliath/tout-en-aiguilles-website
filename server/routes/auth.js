const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { sendVerificationEmail } = require('../utils/email');

// ─── Config upload avatar ────────────────────────────────────
const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../client/assets/images/avatars');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `avatar_u${req.user ? req.user.id : 'x'}_${Date.now()}${ext}`);
  }
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 1 * 1024 * 1024 }, // 1 MB max (le client compresse déjà à ~200 KB)
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Seules les images sont autorisées'));
    cb(null, true);
  }
});

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
  const { email, password, first_name, last_name, username } = req.body;

  if (!email || !password || !first_name || !last_name)
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  if (password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial' });

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

  // Vérifier unicité du pseudo si fourni
  const usernameClean = username?.trim() || null;
  if (usernameClean) {
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(usernameClean);
    if (existingUsername) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
  }

  // Créer le compte (non vérifié)
  const hash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, password_hash, first_name, last_name, username, email_verified) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(email, hash, first_name, last_name, usernameClean);

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

  // Cookie httpOnly pour l'accès au backoffice (admin uniquement)
  if (user.role === 'admin') {
    res.cookie('tea_admin_sess', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    });
  }

  res.json({ token, user: safe });
});

// ─── POST /api/auth/admin-cookie — pose le cookie depuis un token existant ──
// Permet aux admins déjà connectés (localStorage) de récupérer le cookie
router.post('/admin-cookie', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requis' });
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Accès refusé' });
    res.cookie('tea_admin_sess', auth.slice(7), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Token invalide' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────
router.get('/me', requireAuth, (req, res) => {
  const user = db.prepare('SELECT id, email, first_name, last_name, username, role, email_verified, created_at, avatar_url FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// ─── PUT /api/auth/me ───────────────────────────────────────
router.put('/me', requireAuth, (req, res) => {
  const { first_name, last_name, username } = req.body;
  const usernameClean = username?.trim() || null;
  if (usernameClean) {
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(usernameClean, req.user.id);
    if (conflict) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
  }
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, username = ? WHERE id = ?').run(first_name, last_name, usernameClean, req.user.id);
  res.json({ success: true });
});

// ─── POST /api/auth/avatar ──────────────────────────────────
router.post('/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier image requis' });

  // Supprimer l'ancien avatar si présent
  const user = db.prepare('SELECT avatar_url FROM users WHERE id = ?').get(req.user.id);
  if (user && user.avatar_url) {
    const oldPath = path.join(__dirname, '../../client', user.avatar_url);
    if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch {} }
  }

  const avatarUrl = `/assets/images/avatars/${req.file.filename}`;
  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(avatarUrl, req.user.id);
  res.json({ avatar_url: avatarUrl, message: 'Photo de profil mise à jour !' });
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
