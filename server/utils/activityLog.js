const db = require('../db/database');

/**
 * Enregistre une action admin dans le journal d'activité.
 * Ne doit jamais faire planter la requête appelante en cas d'erreur.
 * @param {object} user - req.user (contient id, email)
 * @param {string} action - ex: "Produit créé", "Commande #12 → expédiée"
 * @param {string} [details] - contexte additionnel (ex: nom du produit)
 */
function logActivity(user, action, details = '') {
  try {
    db.prepare('INSERT INTO admin_activity_log (admin_id, admin_name, action, details) VALUES (?, ?, ?, ?)')
      .run(user?.id || null, user?.email || 'Admin', action, details);
  } catch (e) {
    console.error('Erreur journal activité :', e.message);
  }
}

module.exports = { logActivity };
