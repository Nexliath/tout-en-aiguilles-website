const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { asyncRoute } = require('../middleware/asyncRoute');
const { sendVerificationEmail, sendEmailChangeConfirmation, sendPasswordResetEmail } = require('../utils/email');

// ─── Config upload avatar — stockage mémoire → base64 en DB ──
// (évite la perte des fichiers à chaque redéploiement Railway)
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
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
function resetTokenExpiresAt() {
  // Durée plus courte que la vérification d'email (24h) : une demande de
  // réinitialisation de mot de passe est plus sensible, le lien doit expirer vite.
  const d = new Date();
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

// ─── MFA (TOTP) — helpers ──────────────────────────────────────
// Deux types de tokens temporaires, distincts d'un token de session normal
// (voir champ "purpose", rejeté explicitement par requireAuth) :
//  - mfa_challenge : émis après mot de passe correct quand le MFA est déjà
//    actif, doit être échangé contre un vrai token via /mfa/verify.
//  - mfa_setup : émis après mot de passe correct pour un compte admin SANS
//    MFA actif — force l'activation avant de délivrer un token de session.
function signPurposeToken(userId, purpose, expiresIn) {
  return jwt.sign({ id: userId, purpose }, JWT_SECRET, { expiresIn });
}
function verifyPurposeToken(token, expectedPurpose) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.purpose !== expectedPurpose) return null;
    return payload;
  } catch {
    return null;
  }
}
// ─── Chiffrement au repos du secret TOTP ────────────────────────
// Le secret MFA (mfa_secret) permet à quiconque le lit de générer des codes
// valides — un accès en lecture seule à la base (dump, backup mal protégé)
// suffirait sinon à contourner totalement le second facteur. Chiffré en
// AES-256-GCM avec une clé dérivée de JWT_SECRET (pas de nouvelle variable
// d'env à gérer). Format stocké : "enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>".
// decryptSecret() retombe sur la valeur brute si elle ne porte pas ce préfixe,
// pour rester compatible avec les secrets déjà en clair en base (pas de
// migration de données requise, chiffrement transparent à la prochaine écriture).
const MFA_ENC_PREFIX = 'enc:v1:';
const mfaEncKey = crypto.createHash('sha256').update(JWT_SECRET).digest();
function encryptSecret(plain) {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', mfaEncKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MFA_ENC_PREFIX + iv.toString('hex') + ':' + tag.toString('hex') + ':' + ciphertext.toString('hex');
}
function decryptSecret(stored) {
  if (!stored || !stored.startsWith(MFA_ENC_PREFIX)) return stored; // legacy en clair
  try {
    const [ivHex, tagHex, dataHex] = stored.slice(MFA_ENC_PREFIX.length).split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', mfaEncKey, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  } catch (e) {
    console.error('Erreur déchiffrement secret MFA:', e.message);
    return null;
  }
}
// Vérifie un code TOTP en distinguant trois cas : vrai, faux, ou secret
// illisible (déchiffrement impossible — typiquement parce que JWT_SECRET a
// changé depuis l'activation du MFA, puisque la clé de chiffrement en
// dérive). Ce 3e cas n'est PAS un code invalide : réessayer un autre code ne
// changera rien, alors qu'un vrai "code invalide" peut se corriger au
// prochain essai. Les deux ne doivent donc pas produire le même message.
function checkTotp(code, encryptedSecret) {
  if (!encryptedSecret) return false;
  const secret = decryptSecret(encryptedSecret);
  if (!secret) return null; // déchiffrement impossible
  return authenticator.check(String(code).trim(), secret);
}
const MFA_SECRET_UNREADABLE_MSG = 'Erreur de configuration serveur : le secret de double authentification de ce compte est illisible. Utilisez un code de secours si vous en avez, sinon contactez le support.';

function generateRecoveryCodes() {
  const plain = [];
  const hashed = [];
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(5).toString('hex'); // 10 caractères hex
    plain.push(code);
    hashed.push(bcrypt.hashSync(code, 10));
  }
  return { plain, hashed };
}
// Émet le vrai token de session (utilisé après login direct, après
// vérification MFA réussie, ou après activation forcée du MFA admin).
function issueSession(user, res) {
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  const { password_hash, mfa_secret, mfa_recovery_codes, ...safe } = user;
  safe.mfa_enabled = !!user.mfa_enabled;

  if (user.role === 'admin') {
    res.cookie('tea_admin_sess', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 jours
    });
  }
  return { token, user: safe };
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
// Hash factice utilisé quand l'email n'existe pas, pour que bcrypt.compareSync
// s'exécute dans les deux cas (email inconnu / mot de passe incorrect) — sans
// ça, le temps de réponse laisse deviner si un email est enregistré ou non.
const DUMMY_HASH = bcrypt.hashSync('dummy_password_constant_time', 10);
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const passwordOk = bcrypt.compareSync(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !passwordOk)
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });

  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Veuillez confirmer votre adresse email avant de vous connecter.',
      pending_verification: true,
      email: user.email,
    });
  }

  // MFA déjà actif → mot de passe correct mais pas de token final tant que
  // le code à 6 chiffres n'est pas vérifié (voir /mfa/verify).
  if (user.mfa_enabled) {
    const mfaToken = signPurposeToken(user.id, 'mfa_challenge', '5m');
    return res.json({ mfa_required: true, mfa_token: mfaToken });
  }

  // MFA non actif mais compte admin → activation obligatoire avant tout
  // accès. Impossible d'obtenir un token de session admin sans être passé
  // par l'écran d'activation (voir /mfa/setup/init puis /mfa/setup/confirm).
  if (user.role === 'admin') {
    const setupToken = signPurposeToken(user.id, 'mfa_setup', '15m');
    return res.json({ mfa_setup_required: true, setup_token: setupToken });
  }

  const { token, user: safe } = issueSession(user, res);
  res.json({ token, user: safe });
});

// ─── MFA (TOTP) ──────────────────────────────────────────────

// Résout l'utilisateur ciblé par une requête MFA : soit via un token de
// finalité limitée (setup en cours / défi de connexion), soit via un
// Authorization Bearer classique (auto-activation volontaire depuis "Mon
// compte" pour un utilisateur déjà connecté). `via` indique la méthode de
// résolution — utilisé pour décider si une ré-authentification (mot de
// passe + code actuel) est exigée avant de régénérer un secret déjà actif.
function resolveMfaUser(req, expectedPurpose) {
  const { setup_token, mfa_token } = req.body;
  const purposeToken = expectedPurpose === 'mfa_setup' ? setup_token : mfa_token;
  if (purposeToken) {
    const payload = verifyPurposeToken(purposeToken, expectedPurpose);
    if (!payload) return null;
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    return user ? { user, via: 'token' } : null;
  }
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(auth.slice(7), JWT_SECRET);
      if (payload.purpose) return null; // pas un vrai token de session
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
      return user ? { user, via: 'bearer' } : null;
    } catch { return null; }
  }
  return null;
}

// ── Anti-bruteforce MFA (par compte, en plus du rate-limit IP global) ──
// Map user_id → [timestamps des échecs]. Verrouille temporairement un
// compte après plusieurs codes invalides, pour empêcher un bruteforce
// distribué (plusieurs IP) sur un code TOTP à 6 chiffres.
const mfaFailedAttempts = new Map();
const MFA_MAX_ATTEMPTS = 6;
const MFA_LOCK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
function isMfaLocked(userId) {
  const attempts = (mfaFailedAttempts.get(userId) || []).filter(t => Date.now() - t < MFA_LOCK_WINDOW_MS);
  mfaFailedAttempts.set(userId, attempts);
  return attempts.length >= MFA_MAX_ATTEMPTS;
}
function recordMfaFailure(userId) {
  const attempts = (mfaFailedAttempts.get(userId) || []).filter(t => Date.now() - t < MFA_LOCK_WINDOW_MS);
  attempts.push(Date.now());
  mfaFailedAttempts.set(userId, attempts);
}
function clearMfaAttempts(userId) {
  mfaFailedAttempts.delete(userId);
}
const MFA_LOCK_MSG = 'Trop de tentatives échouées. Réessayez dans quelques minutes.';

// POST /api/auth/mfa/setup/init — génère (ou régénère) un secret TOTP en
// attente de confirmation. Accessible via setup_token (activation forcée
// admin, uniquement avant la première activation) ou via un token de
// session classique (auto-activation volontaire, ou reconfiguration d'un
// MFA déjà actif — dans ce cas mot de passe + code actuel sont exigés pour
// empêcher qu'un token de session volé suffise à prendre le contrôle du
// second facteur).
router.post('/mfa/setup/init', asyncRoute(async (req, res) => {
  const resolved = resolveMfaUser(req, 'mfa_setup');
  if (!resolved) return res.status(401).json({ error: 'Session invalide ou expirée, reconnectez-vous.' });
  const { user, via } = resolved;

  if (user.mfa_enabled) {
    if (via === 'token') {
      // Un setup_token n'est valide que pour une PREMIÈRE activation ; un
      // compte déjà protégé doit repasser par la reconfiguration volontaire
      // (Bearer + réauthentification) depuis Mon compte.
      return res.status(400).json({ error: 'Le MFA est déjà actif sur ce compte. Reconfigurez-le depuis "Mon compte".' });
    }
    if (isMfaLocked(user.id)) return res.status(429).json({ error: MFA_LOCK_MSG });
    const { password, code } = req.body;
    const passwordOk = password && bcrypt.compareSync(password, user.password_hash);
    const totpResult = code ? checkTotp(code, user.mfa_secret) : false;
    if (totpResult === null) return res.status(500).json({ error: MFA_SECRET_UNREADABLE_MSG });
    if (!passwordOk || !totpResult) {
      recordMfaFailure(user.id);
      return res.status(401).json({ error: 'Mot de passe et code de vérification actuel requis pour reconfigurer le MFA.' });
    }
    clearMfaAttempts(user.id);
  }

  const secret = authenticator.generateSecret();
  db.prepare('UPDATE users SET mfa_secret = ? WHERE id = ?').run(encryptSecret(secret), user.id);

  const uri = authenticator.keyuri(user.email, 'Tout en Aiguilles', secret);
  try {
    const qr = await qrcode.toDataURL(uri);
    res.json({ secret, qr, otpauth_uri: uri });
  } catch (e) {
    console.error('Erreur génération QR MFA:', e.message);
    res.status(500).json({ error: 'Erreur lors de la génération du QR code' });
  }
}));

// POST /api/auth/mfa/setup/confirm — vérifie le premier code et active le
// MFA. Renvoie le token de session final + les codes de récupération
// (affichés une seule fois, à noter par l'utilisateur).
router.post('/mfa/setup/confirm', asyncRoute(async (req, res) => {
  const resolved = resolveMfaUser(req, 'mfa_setup');
  if (!resolved) return res.status(401).json({ error: 'Session invalide ou expirée, reconnectez-vous.' });
  const { user } = resolved;
  if (isMfaLocked(user.id)) return res.status(429).json({ error: MFA_LOCK_MSG });

  const { code } = req.body;
  if (!user.mfa_secret) return res.status(400).json({ error: "Aucune activation en cours — relancez la configuration." });
  const totpResult = code ? checkTotp(code, user.mfa_secret) : false;
  if (totpResult === null) return res.status(500).json({ error: MFA_SECRET_UNREADABLE_MSG });
  if (!totpResult) {
    recordMfaFailure(user.id);
    return res.status(400).json({ error: 'Code invalide. Vérifiez l\'heure de votre téléphone et réessayez.' });
  }
  clearMfaAttempts(user.id);

  const { plain, hashed } = generateRecoveryCodes();
  db.prepare('UPDATE users SET mfa_enabled = 1, mfa_recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashed), user.id);

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  const { token, user: safe } = issueSession(updated, res);
  res.json({ token, user: safe, recovery_codes: plain });
}));

// POST /api/auth/mfa/verify — défi de connexion pour un compte ayant déjà
// le MFA actif. Accepte un code TOTP à 6 chiffres OU un code de récupération.
router.post('/mfa/verify', asyncRoute(async (req, res) => {
  const { mfa_token, code, recovery_code } = req.body;
  const payload = verifyPurposeToken(mfa_token, 'mfa_challenge');
  if (!payload) return res.status(401).json({ error: 'Session de connexion expirée, reconnectez-vous.' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
  if (!user || !user.mfa_enabled) return res.status(401).json({ error: 'Session invalide.' });
  if (isMfaLocked(user.id)) return res.status(429).json({ error: MFA_LOCK_MSG });

  if (code) {
    const totpResult = checkTotp(code, user.mfa_secret);
    if (totpResult === null) return res.status(500).json({ error: MFA_SECRET_UNREADABLE_MSG });
    if (!totpResult) {
      recordMfaFailure(user.id);
      return res.status(400).json({ error: 'Code invalide.' });
    }
  } else if (recovery_code) {
    const hashed = JSON.parse(user.mfa_recovery_codes || '[]');
    const idx = hashed.findIndex(h => bcrypt.compareSync(String(recovery_code).trim(), h));
    if (idx === -1) {
      recordMfaFailure(user.id);
      return res.status(400).json({ error: 'Code de récupération invalide ou déjà utilisé.' });
    }
    hashed.splice(idx, 1); // usage unique
    db.prepare('UPDATE users SET mfa_recovery_codes = ? WHERE id = ?').run(JSON.stringify(hashed), user.id);
  } else {
    return res.status(400).json({ error: 'Code requis.' });
  }
  clearMfaAttempts(user.id);

  const { token, user: safe } = issueSession(user, res);
  res.json({ token, user: safe });
}));

// POST /api/auth/mfa/disable — désactivation volontaire (mot de passe +
// code TOTP OU code de récupération). Pour un compte admin, le MFA sera
// simplement redemandé à la prochaine connexion (voir /login) — pas de
// contournement possible.
router.post('/mfa/disable', requireAuth, asyncRoute(async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  if (!user.mfa_enabled) return res.status(400).json({ error: 'Le MFA n\'est pas activé sur ce compte.' });
  if (isMfaLocked(user.id)) return res.status(429).json({ error: MFA_LOCK_MSG });

  const { password, code, recovery_code } = req.body;
  if (!password || !bcrypt.compareSync(password, user.password_hash)) {
    recordMfaFailure(user.id);
    return res.status(401).json({ error: 'Mot de passe incorrect.' });
  }

  let verified = false;
  let remainingRecoveryCodes = null;
  if (code) {
    const totpResult = checkTotp(code, user.mfa_secret);
    // Le code de récupération reste une voie de sortie indépendante du
    // secret TOTP — mais ici le client a choisi la voie "code" (pas
    // recovery_code), donc un secret illisible doit être signalé
    // explicitement plutôt que traité comme un simple code invalide.
    if (totpResult === null) return res.status(500).json({ error: MFA_SECRET_UNREADABLE_MSG });
    verified = totpResult === true;
  } else if (recovery_code) {
    const hashed = JSON.parse(user.mfa_recovery_codes || '[]');
    const idx = hashed.findIndex(h => bcrypt.compareSync(String(recovery_code).trim(), h));
    if (idx !== -1) {
      verified = true;
      hashed.splice(idx, 1);
      remainingRecoveryCodes = hashed;
    }
  }
  if (!verified) {
    recordMfaFailure(user.id);
    return res.status(400).json({ error: 'Code de vérification invalide.' });
  }
  clearMfaAttempts(user.id);

  // Si désactivé via un code de récupération, on persiste quand même la
  // consommation avant de tout effacer — cohérence si jamais une autre
  // requête concurrente lisait encore l'ancienne liste (fenêtre très courte).
  if (remainingRecoveryCodes !== null) {
    db.prepare('UPDATE users SET mfa_recovery_codes = ? WHERE id = ?').run(JSON.stringify(remainingRecoveryCodes), user.id);
  }
  db.prepare('UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery_codes = NULL WHERE id = ?').run(user.id);
  res.json({ message: 'Double authentification désactivée.' });
}));

// ─── POST /api/auth/forgot-password ─────────────────────────
// Toujours une réponse générique (que l'email existe ou non) pour ne pas
// permettre d'énumérer les comptes existants.
const forgotPasswordAttempts = new Map(); // email → [timestamps] — anti-abus simple, en mémoire
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  const generic = { message: 'Si un compte existe avec cet email, un lien de réinitialisation vient de lui être envoyé.' };
  if (!email) return res.json(generic);

  // Anti-abus léger : max 3 demandes / 15 min pour un même email
  const now = Date.now();
  const key = email.toLowerCase().trim();
  const attempts = (forgotPasswordAttempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  if (attempts.length >= 3) return res.json(generic);
  attempts.push(now);
  forgotPasswordAttempts.set(key, attempts);

  const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  if (!user) return res.json(generic);

  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  const token = generateToken();
  db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)').run(user.id, token, resetTokenExpiresAt());

  res.json(generic);
  sendPasswordResetEmail(user.email, user.first_name, token, BASE_URL)
    .catch(err => console.error('Erreur envoi email réinitialisation:', err.message));
});

// ─── GET /api/auth/reset-password/verify?token=xxx ──────────
// Vérifie la validité d'un lien avant d'afficher le formulaire (évite de
// laisser l'utilisateur saisir un mot de passe pour un lien déjà expiré).
router.get('/reset-password/verify', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ valid: false, error: 'Lien invalide' });
  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);
  if (!row || new Date(row.expires_at) < new Date()) {
    return res.status(400).json({ valid: false, error: 'Ce lien est invalide ou a expiré.' });
  }
  res.json({ valid: true });
});

// ─── POST /api/auth/reset-password ───────────────────────────
router.post('/reset-password', (req, res) => {
  const { token, new_password } = req.body;
  if (!token || !new_password) return res.status(400).json({ error: 'Token et nouveau mot de passe requis' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Le mot de passe doit faire au moins 8 caractères' });
  if (!/[A-Z]/.test(new_password) || !/[0-9]/.test(new_password) || !/[^A-Za-z0-9]/.test(new_password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial' });

  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token = ?').get(token);
  if (!row) return res.status(400).json({ error: 'Lien invalide ou déjà utilisé' });
  if (new Date(row.expires_at) < new Date()) {
    db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').run(row.id);
    return res.status(400).json({ error: 'Ce lien a expiré. Refaites une demande de réinitialisation.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(row.user_id);

  res.json({ success: true, message: 'Votre mot de passe a été réinitialisé. Vous pouvez maintenant vous connecter.' });
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
  const user = db.prepare('SELECT id, email, first_name, last_name, username, role, email_verified, created_at, avatar_url, newsletter_opt_out, mfa_enabled FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  user.mfa_enabled = !!user.mfa_enabled;
  res.json(user);
});

// ─── PUT /api/auth/me ───────────────────────────────────────
router.put('/me', requireAuth, (req, res) => {
  const existingUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!existingUser) return res.status(404).json({ error: 'Utilisateur introuvable' });
  const { first_name, last_name, username, newsletter_opt_out } = req.body;
  // node:sqlite n'accepte pas `undefined` comme valeur liée — un appel qui ne
  // renvoie qu'un sous-ensemble des champs (ex. juste newsletter_opt_out) ne
  // doit pas faire planter la requête ni effacer les champs non fournis.
  const finalFirstName = first_name !== undefined ? first_name : existingUser.first_name;
  const finalLastName  = last_name  !== undefined ? last_name  : existingUser.last_name;
  const usernameClean = username !== undefined ? (username?.trim() || null) : existingUser.username;
  if (usernameClean) {
    const conflict = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(usernameClean, req.user.id);
    if (conflict) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé' });
  }
  db.prepare('UPDATE users SET first_name = ?, last_name = ?, username = ?, newsletter_opt_out = ? WHERE id = ?')
    .run(finalFirstName, finalLastName, usernameClean, newsletter_opt_out !== undefined ? (newsletter_opt_out ? 1 : 0) : existingUser.newsletter_opt_out, req.user.id);
  // Synchroniser le statut dans newsletter_subscribers
  if (newsletter_opt_out !== undefined) {
    const user = db.prepare('SELECT email FROM users WHERE id = ?').get(req.user.id);
    if (user) {
      if (newsletter_opt_out) {
        db.prepare('UPDATE newsletter_subscribers SET is_active = 0 WHERE email = ?').run(user.email);
      } else {
        db.prepare('INSERT OR IGNORE INTO newsletter_subscribers (email, first_name, source) VALUES (?, ?, \'user\')').run(user.email, finalFirstName || '');
        db.prepare('UPDATE newsletter_subscribers SET is_active = 1 WHERE email = ?').run(user.email);
      }
    }
  }
  res.json({ success: true });
});

// ─── POST /api/auth/change-email ───────────────────────────
// Demande de changement d'email (envoie un lien de confirmation à la NOUVELLE adresse)
router.post('/change-email', requireAuth, (req, res) => {
  const { new_email, password } = req.body;
  if (!new_email || !password) return res.status(400).json({ error: 'Nouvel email et mot de passe requis' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (!bcrypt.compareSync(password, user.password_hash))
    return res.status(401).json({ error: 'Mot de passe incorrect' });

  if (new_email.toLowerCase() === user.email.toLowerCase())
    return res.status(400).json({ error: 'C\'est déjà votre adresse email actuelle' });

  const existing = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(new_email);
  if (existing) return res.status(409).json({ error: 'Cette adresse email est déjà utilisée' });

  const token = generateToken();
  const expiresAt = tokenExpiresAt();

  db.prepare('UPDATE users SET pending_email = ?, email_change_token = ?, email_change_expires_at = ? WHERE id = ?')
    .run(new_email, token, expiresAt, req.user.id);

  res.json({ message: `Un lien de confirmation a été envoyé à ${new_email}. Cliquez dessus pour valider le changement.` });

  // Envoi asynchrone à la NOUVELLE adresse
  sendEmailChangeConfirmation(new_email, user.first_name, token, BASE_URL)
    .catch(err => console.error('Erreur envoi email changement:', err.message));
});

// ─── GET /api/auth/confirm-email-change?token=xxx ──────────
// Confirmation du changement d'email via le lien reçu
router.get('/confirm-email-change', (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/compte.html?email_error=invalid');

  const user = db.prepare('SELECT * FROM users WHERE email_change_token = ?').get(token);
  if (!user) return res.redirect('/compte.html?email_error=invalid');

  if (new Date(user.email_change_expires_at) < new Date()) {
    db.prepare('UPDATE users SET pending_email = NULL, email_change_token = NULL, email_change_expires_at = NULL WHERE id = ?').run(user.id);
    return res.redirect('/compte.html?email_error=expired');
  }

  const newEmail = user.pending_email;
  db.prepare('UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL, email_change_expires_at = NULL WHERE id = ?')
    .run(newEmail, user.id);

  // L'utilisateur doit se reconnecter avec son nouvel email
  res.redirect('/compte.html?email_changed=1');
});

// ─── POST /api/auth/avatar ──────────────────────────────────
// Stockage en base64 dans la DB — persiste entre les redéploiements Railway
router.post('/avatar', requireAuth, uploadAvatar.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Fichier image requis' });

  // Convertir en base64 data URL et stocker en DB (pas de fichier sur disque)
  const mime = req.file.mimetype || 'image/jpeg';
  const b64 = req.file.buffer.toString('base64');
  const dataUrl = `data:${mime};base64,${b64}`;

  db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(dataUrl, req.user.id);
  res.json({ avatar_url: dataUrl, message: 'Photo de profil mise à jour !' });
});

// ─── PUT /api/auth/password ─────────────────────────────────
router.put('/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash))
    return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
  if (new_password.length < 8)
    return res.status(400).json({ error: 'Le nouveau mot de passe doit faire au moins 8 caractères' });
  if (!/[A-Z]/.test(new_password) || !/[0-9]/.test(new_password) || !/[^A-Za-z0-9]/.test(new_password))
    return res.status(400).json({ error: 'Le mot de passe doit contenir au moins une majuscule, un chiffre et un caractère spécial' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  res.json({ success: true });
});

// ─── GET /api/auth/export ────────────────────────────────────
// RGPD (droit à la portabilité) : export JSON de toutes les données
// personnelles du compte connecté, téléchargeable par le client lui-même.
router.get('/export', requireAuth, (req, res) => {
  const profile = db.prepare(
    'SELECT id, email, first_name, last_name, username, created_at, newsletter_opt_out FROM users WHERE id = ?'
  ).get(req.user.id);
  if (!profile) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const addresses = db.prepare('SELECT label, first_name, last_name, address, postal_code, city, country, is_primary FROM addresses WHERE user_id = ?').all(req.user.id);
  const orders = db.prepare('SELECT id, status, total, items, delivery_type, delivery_fee, created_at FROM orders WHERE user_id = ?').all(req.user.id)
    .map(o => ({ ...o, items: (() => { try { return JSON.parse(o.items); } catch { return o.items; } })() }));
  const favorites = db.prepare(`
    SELECT p.id, p.name FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.user_id = ?
  `).all(req.user.id);
  const reviews = db.prepare('SELECT product_id, rating, comment, created_at FROM reviews WHERE user_id = ?').all(req.user.id);

  res.setHeader('Content-Disposition', `attachment; filename="mes-donnees-tout-en-aiguilles.json"`);
  res.json({ exported_at: new Date().toISOString(), profile, addresses, orders, favorites, reviews });
});

// ─── DELETE /api/auth/account ────────────────────────────────
// RGPD (droit à l'effacement) : suppression du compte par le client
// lui-même. Les commandes passées sont conservées (obligation légale de
// conservation des factures, Code de commerce), mais ne sont plus liées
// à un compte actif — comme pour une suppression de compte côté admin.
router.delete('/account', requireAuth, (req, res) => {
  const { password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  if (user.role === 'admin') {
    return res.status(400).json({ error: 'Les comptes administrateur ne peuvent pas être supprimés depuis cette page.' });
  }
  if (!password || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Mot de passe incorrect' });
  }

  // orders.user_id n'a pas de ON DELETE CASCADE/SET NULL en base (volontaire :
  // on ne veut jamais perdre une commande) — il faut détacher manuellement les
  // commandes du compte avant de le supprimer, sinon la contrainte de clé
  // étrangère (PRAGMA foreign_keys = ON) bloque le DELETE ci-dessous avec une
  // erreur pour TOUT client ayant déjà passé au moins une commande.
  db.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

  res.json({ success: true, message: 'Votre compte a été supprimé.' });
});

module.exports = router;
