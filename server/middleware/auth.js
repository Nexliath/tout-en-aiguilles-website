const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'toutenaiguilles_secret_dev_key_2024';

// Vérifie que l'utilisateur est connecté
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non autorisé — connexion requise' });
  }
  try {
    const token = auth.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);
    // Les tokens à finalité limitée (mfa_challenge, mfa_setup — voir
    // routes/auth.js) ne sont jamais des tokens de session valides, même
    // s'ils sont signés avec le même secret : un vol de token MFA en transit
    // ne doit pas donner accès à l'API.
    if (payload.purpose) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Vérifie que l'utilisateur est admin
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès réservé aux administrateurs' });
    }
    next();
  });
}

module.exports = { requireAuth, requireAdmin };
