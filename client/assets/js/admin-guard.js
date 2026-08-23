/* ============================================================
   Tout en Aiguilles — Garde de connexion admin partagée
   ------------------------------------------------------------
   Remplace le code auparavant dupliqué sur les 8 pages admin
   (checkAdmin() + handler du bouton guard-btn), qui ne gérait pas
   le MFA et cassait toute connexion admin directe une fois le MFA
   rendu obligatoire (data.user était undefined pour les réponses
   mfa_required / mfa_setup_required).

   Chaque page admin doit :
   1. Charger main.js AVANT ce script (Auth, apiFetch, Toast, le
      modal MFA openAuthModal/showMfaVerifyStep/showMfaSetupStep).
   2. Définir window.ADMIN_ON_READY = function() { ... } avant ce
      script, pour lancer son chargement de données une fois connecté.
   3. Contenir le markup #admin-guard / #admin-content standard.
   ============================================================ */

function checkAdmin() {
  const guard   = document.getElementById('admin-guard');
  const content = document.getElementById('admin-content');
  if (!guard || !content) return;
  if (!Auth.isLoggedIn() || !Auth.isAdmin()) {
    content.style.display = 'none';
    guard.style.display   = 'flex';
  } else {
    guard.style.display   = 'none';
    content.style.display = '';
    _adminSessionExpiredNotified = false;
    if (typeof window.ADMIN_ON_READY === 'function') window.ADMIN_ON_READY();
  }
}

function adminGuardLogin() {
  const email    = document.getElementById('guard-email').value.trim();
  const password = document.getElementById('guard-password').value;
  const errEl    = document.getElementById('guard-error');
  const btn      = document.getElementById('guard-btn');
  errEl.style.display = 'none';
  if (!email || !password) { errEl.textContent = 'Email et mot de passe requis'; errEl.style.display = ''; return; }
  btn.disabled = true; btn.textContent = '…';

  apiFetch('/auth/login', { method: 'POST', body: { email: email, password: password } })
    .then(function(data) {
      // Compte avec MFA déjà actif → écran de vérification du code, dans
      // le modal partagé (z-index supérieur à #admin-guard, voir style.css).
      if (data.mfa_required) {
        openAuthModal();
        showMfaVerifyStep(data.mfa_token);
        btn.disabled = false; btn.textContent = 'Se connecter →';
        return;
      }
      // Compte admin sans MFA → activation obligatoire avant tout accès.
      if (data.mfa_setup_required) {
        openAuthModal();
        showMfaSetupStep(data.setup_token, true);
        btn.disabled = false; btn.textContent = 'Se connecter →';
        return;
      }
      if (data.user.role !== 'admin') throw new Error("Ce compte n'est pas administrateur.");
      Auth.save(data.token, data.user);
      checkAdmin();
    })
    .catch(function(e) {
      errEl.textContent = e.message; errEl.style.display = '';
      btn.disabled = false; btn.textContent = 'Se connecter →';
    });
}

// Rebascule proprement vers la garde admin si le token expire pendant une
// action (au lieu de laisser chaque appel API échouer silencieusement).
// Le flag évite d'empiler plusieurs toasts si plusieurs requêtes échouent
// en rafale sur la même expiration de session.
let _adminSessionExpiredNotified = false;
window.onApiUnauthorized = function() {
  if (!document.getElementById('admin-guard')) return; // pas une page admin
  if (!Auth.isLoggedIn()) return; // déjà déconnecté, rien à faire
  localStorage.removeItem('tea_token');
  localStorage.removeItem('tea_user');
  if (!_adminSessionExpiredNotified) {
    _adminSessionExpiredNotified = true;
    Toast.show('Votre session a expiré — reconnectez-vous.', 'error');
  }
  checkAdmin();
};

document.addEventListener('DOMContentLoaded', function() {
  const btn = document.getElementById('guard-btn');
  if (btn) btn.addEventListener('click', adminGuardLogin);
  const pwd = document.getElementById('guard-password');
  if (pwd) {
    pwd.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') adminGuardLogin();
    });
  }
  checkAdmin();
});
