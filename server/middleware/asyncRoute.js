// Wrapper pour les routes async (Express 4 ne capture pas nativement les
// rejets de promesse dans un handler de route — une erreur non catchée,
// par exemple un fichier image corrompu envoyé à sharp, ferait planter
// tout le process Node au lieu de simplement renvoyer une erreur 500).
function asyncRoute(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(err => {
      console.error('Erreur route async:', err.message);
      if (!res.headersSent) res.status(500).json({ error: 'Erreur serveur — réessayez ou contactez le support si le problème persiste.' });
    });
  };
}
module.exports = { asyncRoute };
