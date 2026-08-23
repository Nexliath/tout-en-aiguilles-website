/* ============================================================
   Tout en Aiguilles — JavaScript partagé
   ============================================================ */

const API = '/api';

// ─── Consentement cookies (RGPD/CNIL) ───────────────────────
// Google Tag Manager ne doit être chargé qu'après consentement explicite
// du visiteur (mesure d'audience = cookie non essentiel). Ce bloc remplace
// le chargement direct de GTM dans le <head> de chaque page publique :
// tant que l'utilisateur n'a pas répondu, GTM n'est pas chargé du tout.
const GTM_ID = 'GTM-5M8NK6RH';
const COOKIE_CONSENT_KEY = 'tea_cookie_consent';

function loadGTM() {
  if (window._gtmLoaded) return;
  window._gtmLoaded = true;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  const f = document.getElementsByTagName('script')[0];
  const j = document.createElement('script');
  j.async = true;
  j.src = 'https://www.googletagmanager.com/gtm.js?id=' + GTM_ID;
  f.parentNode.insertBefore(j, f);
}

function initCookieConsent() {
  if (document.getElementById('admin-guard')) return; // pas de bannière dans le backoffice
  const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
  if (consent === 'accepted') { loadGTM(); return; }
  if (consent === 'rejected') return;
  showCookieBanner();
}

function showCookieBanner() {
  if (document.getElementById('cookie-banner')) return;
  const el = document.createElement('div');
  el.id = 'cookie-banner';
  el.innerHTML = `
    <div class="cookie-banner-inner">
      <p>🍪 Nous utilisons des cookies de mesure d'audience pour comprendre comment le site est utilisé. Vous pouvez les accepter ou les refuser à tout moment. <a href="/mentions-legales.html">En savoir plus</a></p>
      <div class="cookie-banner-actions">
        <button type="button" class="btn btn-ghost btn-sm" onclick="setCookieConsent(false)">Refuser</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="setCookieConsent(true)">Accepter</button>
      </div>
    </div>`;
  document.body.appendChild(el);
}

function setCookieConsent(accepted) {
  localStorage.setItem(COOKIE_CONSENT_KEY, accepted ? 'accepted' : 'rejected');
  const el = document.getElementById('cookie-banner');
  if (el) el.remove();
  if (accepted) loadGTM();
  showCookieFab();
}

function openCookieSettings() {
  localStorage.removeItem(COOKIE_CONSENT_KEY);
  const fab = document.getElementById('cookie-fab');
  if (fab) fab.remove();
  showCookieBanner();
}

function showCookieFab() {
  if (document.getElementById('admin-guard')) return;
  if (document.getElementById('cookie-fab')) return;
  const btn = document.createElement('button');
  btn.id = 'cookie-fab';
  btn.type = 'button';
  btn.className = 'cookie-fab';
  btn.title = 'Gérer les cookies';
  btn.setAttribute('aria-label', 'Gérer les cookies');
  btn.textContent = '🍪';
  btn.onclick = openCookieSettings;
  document.body.appendChild(btn);
}

initCookieConsent();
if (localStorage.getItem(COOKIE_CONSENT_KEY)) showCookieFab();

// ─── Sidebar admin partagée ─────────────────────────────────
// Évite de dupliquer le HTML de la sidebar dans chaque page admin.
// Injectée dans <div id="admin-sidebar-mount"></div> si présent sur la page.
const ADMIN_NAV_ITEMS = [
  { href: 'index.html',        icon: '📊', label: 'Tableau de bord' },
  { href: 'produits.html',     icon: '🧶', label: 'Produits' },
  { href: 'commandes.html',    icon: '📦', label: 'Commandes' },
  { href: 'actualites.html',   icon: '📝', label: 'Actualités' },
  { href: 'utilisateurs.html', icon: '👥', label: 'Utilisateurs' },
  { href: 'avis.html',         icon: '⭐', label: 'Avis' },
  { href: 'promo.html',        icon: '🏷️', label: 'Codes promo' },
  { href: 'newsletter.html',   icon: '📧', label: 'Newsletter' },
];
function renderAdminSidebar() {
  const mount = document.getElementById('admin-sidebar-mount');
  if (!mount) return;
  const current = (location.pathname.split('/').pop() || 'index.html');
  mount.innerHTML = `
    <div class="admin-mobile-bar">
      <button class="admin-hamburger" onclick="toggleAdminSidebar()" aria-label="Menu">☰</button>
      <span class="admin-mobile-title">🧶 Administration</span>
    </div>
    <div class="admin-sidebar-backdrop" onclick="toggleAdminSidebar()"></div>
    <aside class="admin-sidebar">
      <div class="admin-logo">
        <span style="display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:11px;background:linear-gradient(135deg,var(--rose) 0%,var(--rose-dark) 100%);font-size:1.15rem;flex-shrink:0">🧶</span>
        <span style="line-height:1.3">Tout en Aiguilles<br><span style="font-size:.7rem;opacity:.5;font-family:var(--font-body)">Administration</span></span>
      </div>
      <nav class="admin-nav">
        ${ADMIN_NAV_ITEMS.map(item => `<a href="${item.href}"${item.href === current ? ' class="active"' : ''}>${item.icon} ${item.label}</a>`).join('\n        ')}
        <div style="height:1px;background:rgba(255,255,255,.1);margin:8px 0"></div>
        <a href="/" target="_blank">🌐 Voir le site</a>
        <a href="#" onclick="Auth.logout()" style="color:rgba(255,100,100,.7)!important">🚪 Déconnexion</a>
      </nav>
    </aside>`;
}
renderAdminSidebar();

// ─── Mobile nav ──────────────────────────────────────────────
// window.closeMobileSearch est défini par initHeaderSearch() (plus bas) —
// les 3 panneaux mobiles (recherche, menu, sidebar admin) peuvent chacun
// s'ouvrir en plein écran sur petit écran ; en ouvrir un doit fermer les
// autres pour éviter de les superposer.
function openMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (nav) { nav.classList.add('open'); document.body.style.overflow = 'hidden'; }
  window.closeMobileSearch?.();
  closeAdminSidebar();
}
function closeMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (nav) { nav.classList.remove('open'); document.body.style.overflow = ''; }
}
// Fermer avec la touche Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMobileNav(); closeAdminSidebar(); window.closeMobileSearch?.(); } });

// ─── Admin sidebar (mobile) ────────────────────────────────────
function toggleAdminSidebar() {
  const opening = !document.querySelector('.admin-sidebar')?.classList.contains('open');
  document.querySelector('.admin-sidebar')?.classList.toggle('open');
  document.querySelector('.admin-sidebar-backdrop')?.classList.toggle('open');
  document.body.style.overflow = opening ? 'hidden' : '';
  if (opening) { closeMobileNav(); window.closeMobileSearch?.(); }
}
function closeAdminSidebar() {
  document.querySelector('.admin-sidebar')?.classList.remove('open');
  document.querySelector('.admin-sidebar-backdrop')?.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Recherche header (autocomplete produits) ──────────────────
function initHeaderSearch() {
  const wrap = document.querySelector('.header-search-wrap');
  const input = document.querySelector('.header-search-input');
  const dropdown = document.getElementById('header-search-dropdown');
  const icon = document.querySelector('.header-search-icon');
  if (!input || !dropdown) return;

  let debounceTimer = null;

  function closeDropdown() {
    dropdown.classList.remove('open');
    dropdown.innerHTML = '';
  }

  // Sur mobile/tablette (≤1024px), la barre de recherche est repliée en
  // icône (voir style.css) — un tap l'ouvre en overlay sous le header au
  // lieu de la faire disparaître complètement.
  function closeMobile() {
    if (wrap) wrap.classList.remove('mobile-open');
  }
  // Exposée globalement pour que le handler Escape (tout en haut du fichier)
  // et l'ouverture du menu mobile / de la sidebar admin puissent fermer cet
  // overlay même quand le focus n'est plus dans le champ de recherche —
  // avant cette correction, Escape ne fermait la recherche mobile que si le
  // focus était resté dans l'input (voir le listener keydown local ci-dessous).
  window.closeMobileSearch = closeMobile;
  if (icon && wrap) {
    icon.addEventListener('click', () => {
      if (window.innerWidth > 1024) return; // desktop : icône décorative
      const opening = !wrap.classList.contains('mobile-open');
      wrap.classList.toggle('mobile-open', opening);
      if (opening) {
        setTimeout(() => input.focus(), 50);
        closeMobileNav();
        closeAdminSidebar();
      } else {
        closeDropdown();
      }
    });
  }

  async function runSearch(q) {
    const term = q.trim();
    if (term.length < 2) { closeDropdown(); return; }
    dropdown.innerHTML = '<div class="hs-loading">Recherche…</div>';
    dropdown.classList.add('open');
    try {
      const products = await apiFetch(`/products?search=${encodeURIComponent(term)}&limit=6`);
      if (!products.length) {
        dropdown.innerHTML = `<div class="hs-empty">Aucun résultat pour « ${term} »</div>`;
        return;
      }
      dropdown.innerHTML = products.map(p => `
        <a class="hs-result" href="/produit.html?slug=${p.slug}">
          ${p.images && p.images[0] ? `<img src="${p.images[0]}" alt="">` : '<div class="hs-result-ph">🧶</div>'}
          <div>
            <div class="hs-result-name">${p.name}</div>
            <div class="hs-result-price">${Number(p.price).toFixed(2)} €</div>
          </div>
        </a>`).join('') +
        `<a class="hs-seeall" href="/boutique.html?search=${encodeURIComponent(term)}">Voir tous les résultats →</a>`;
    } catch {
      dropdown.innerHTML = '<div class="hs-empty">Erreur de recherche</div>';
    }
  }

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const q = input.value;
    debounceTimer = setTimeout(() => runSearch(q), 300);
  });
  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) dropdown.classList.add('open');
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const term = input.value.trim();
      if (term) window.location.href = `/boutique.html?search=${encodeURIComponent(term)}`;
    } else if (e.key === 'Escape') {
      closeDropdown();
      closeMobile();
      input.blur();
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.header-search-wrap')) {
      closeDropdown();
      closeMobile();
    }
  });
}

// ─── Auth ────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('tea_token'),
  getUser:  () => { try { return JSON.parse(localStorage.getItem('tea_user')); } catch { return null; } },
  isLoggedIn: () => !!localStorage.getItem('tea_token'),
  isAdmin:  () => { const u = Auth.getUser(); return u && u.role === 'admin'; },
  save: (token, user) => { localStorage.setItem('tea_token', token); localStorage.setItem('tea_user', JSON.stringify(user)); },
  logout: () => { localStorage.removeItem('tea_token'); localStorage.removeItem('tea_user'); window.location.href = '/'; },
  // Comme logout(), mais sans redirection — utilisé quand on veut juste
  // effacer une session expirée sans interrompre la page en cours (ex. un
  // panier en cours de remplissage sur panier.html).
  logoutSilent: () => { localStorage.removeItem('tea_token'); localStorage.removeItem('tea_user'); },
  headers: () => {
    const h = { 'Content-Type': 'application/json' };
    const t = Auth.getToken();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }
};

// ─── API fetch helper ────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: Auth.headers(),
    ...opts,
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  });
  if (opts.body instanceof FormData) {
    const h = { Authorization: Auth.headers().Authorization };
    if (!h.Authorization) delete h.Authorization;
    res._opts = { headers: h };
  }
  const data = await res.json();
  if (!res.ok) throw apiError(data, res.status);
  return data;
}

// Hook global optionnel (voir admin-guard.js) : permet à une page admin de
// rebasculer proprement vers l'écran de connexion quand le token a expiré
// en cours d'utilisation, plutôt que de laisser chaque action échouer
// silencieusement sans explication.
function apiError(data, status) {
  const err = new Error((data && data.error) || 'Erreur serveur');
  err.status = status;
  if (status === 401 && typeof window.onApiUnauthorized === 'function') {
    window.onApiUnauthorized();
  }
  return err;
}

// Gestion par défaut d'une session expirée sur les pages client (compte,
// panier, etc.) — auparavant un token expiré/invalide faisait juste échouer
// chaque appel API avec un message d'erreur générique, sans jamais déconnecter
// l'utilisateur ni lui proposer de se reconnecter. Les pages admin définissent
// leur propre window.onApiUnauthorized (admin-guard.js, chargé après main.js)
// qui remplace celui-ci — ce handler ne s'applique donc qu'aux pages client.
let _clientSessionExpiredNotified = false;
window.onApiUnauthorized = function() {
  if (!Auth.isLoggedIn()) return; // déjà déconnecté, rien à faire
  Auth.logoutSilent();
  if (!_clientSessionExpiredNotified) {
    _clientSessionExpiredNotified = true;
    Toast.show('Votre session a expiré — reconnectez-vous.', 'error');
  }
  if (typeof initHeader === 'function') initHeader();
};

async function apiFetchForm(path, formData, method = 'POST') {
  const headers = {};
  const t = Auth.getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(API + path, { method, headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw apiError(data, res.status);
  return data;
}

// ─── Cart ────────────────────────────────────────────────────
const Cart = {
  get: () => { try { return JSON.parse(localStorage.getItem('tea_cart') || '[]'); } catch { return []; } },
  save: (items) => { localStorage.setItem('tea_cart', JSON.stringify(items)); Cart.updateBadge(); },
  add: (product, qty = 1) => {
    const items = Cart.get();
    const variantId = product._variantId || null;
    const variantLabel = product._variantLabel || null;
    const price = product._variantPrice != null ? product._variantPrice : product.price;
    // Clé unique = produit + variante (permet d'avoir Bleu et Rouge dans le même panier)
    const idx = items.findIndex(i => i.product_id === product.id && (i.variant_id || null) === variantId);
    if (idx >= 0) {
      items[idx].qty += qty;
    } else {
      items.push({
        product_id: product.id,
        name: product.name,
        price,
        qty,
        image: (product.images || [])[0] || '',
        variant_id: variantId,
        variant_label: variantLabel
      });
    }
    Cart.save(items);
    const suffix = variantLabel ? ` — ${variantLabel}` : '';
    Toast.show(`${product.name}${suffix} ajouté au panier 🛒`, 'success');
  },
  // variant_id optionnel : un même produit peut avoir plusieurs lignes dans le
  // panier (une par variante choisie) — sans lui, on retirerait/modifierait
  // la mauvaise ligne si plusieurs couleurs du même produit sont au panier.
  remove: (product_id, variant_id) => { Cart.save(Cart.get().filter(i => !(i.product_id === product_id && (i.variant_id || null) === (variant_id || null)))); },
  updateQty: (product_id, qty, variant_id) => {
    if (qty <= 0) return Cart.remove(product_id, variant_id);
    const items = Cart.get(); const idx = items.findIndex(i => i.product_id === product_id && (i.variant_id || null) === (variant_id || null));
    if (idx >= 0) { items[idx].qty = qty; Cart.save(items); }
  },
  count: () => Cart.get().reduce((s, i) => s + i.qty, 0),
  total: () => Cart.get().reduce((s, i) => s + i.price * i.qty, 0),
  clear: () => { localStorage.removeItem('tea_cart'); Cart.updateBadge(); },
  updateBadge: () => {
    const b = document.querySelector('.cart-badge');
    const n = Cart.count();
    if (b) { b.textContent = n; b.style.display = n > 0 ? 'flex' : 'none'; }
  }
};

// ─── Recently Viewed (Vus récemment) ──────────────────────────
// Stocke uniquement les IDs (léger) ; les données produit sont re-fetchées
// à l'affichage pour toujours montrer prix/stock à jour.
const RecentlyViewed = {
  KEY: 'tea_recently_viewed',
  get: () => { try { return JSON.parse(localStorage.getItem(RecentlyViewed.KEY) || '[]'); } catch { return []; } },
  add: (productId) => {
    if (!productId) return;
    try {
      let ids = RecentlyViewed.get().filter(id => id !== productId);
      ids.unshift(productId);
      localStorage.setItem(RecentlyViewed.KEY, JSON.stringify(ids.slice(0, 8)));
    } catch {}
  }
};

// Rend une grille de cartes produit pour les IDs "vus récemment"
async function renderRecentlyViewedHome(containerId) {
  const ids = RecentlyViewed.get();
  const el = document.getElementById(containerId);
  if (!ids.length || !el) return;
  try {
    const all = await apiFetch('/products?limit=100');
    const products = ids.map(id => all.find(p => p.id === id)).filter(Boolean);
    if (products.length) el.innerHTML = products.map(renderProductCard).join('');
    else {
      const section = document.getElementById('rv-home-section');
      if (section) section.style.display = 'none';
    }
  } catch {}
}

// ─── Favorites ───────────────────────────────────────────────
const Favorites = {
  get: () => { try { return JSON.parse(localStorage.getItem('tea_favs') || '[]'); } catch { return []; } },
  has: (id) => Favorites.get().includes(Number(id)),
  toggle: async (id, btn) => {
    if (!Auth.isLoggedIn()) { openAuthModal(); return; }
    const has = Favorites.has(id);
    try {
      if (has) {
        await apiFetch(`/products/${id}/favorite`, { method: 'DELETE' });
        const favs = Favorites.get().filter(f => f !== Number(id));
        localStorage.setItem('tea_favs', JSON.stringify(favs));
      } else {
        await apiFetch(`/products/${id}/favorite`, { method: 'POST' });
        const favs = [...Favorites.get(), Number(id)];
        localStorage.setItem('tea_favs', JSON.stringify(favs));
      }
      if (btn) {
        btn.classList.toggle('active', !has);
        btn.textContent = has ? '🤍' : '❤️';
      }
      // Si on retire un favori depuis la grille favoris → animer et supprimer la carte
      if (has) {
        var card = btn ? btn.closest('.product-card') : document.querySelector('.product-card[data-id="' + id + '"]');
        if (card && card.closest('#favorites-grid')) {
          card.style.transition = 'opacity 0.3s, transform 0.3s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.9)';
          setTimeout(function() {
            card.remove();
            var grid = document.getElementById('favorites-grid');
            if (grid && !grid.querySelector('.product-card')) {
              grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">❤️</div><h3>Aucun favori</h3><p>Ajoutez des créations à vos favoris depuis la boutique !</p><a href="/boutique.html" class="btn btn-primary mt-md">Parcourir la boutique</a></div>';
            }
          }, 300);
        }
      }
      Toast.show(has ? 'Retiré des favoris' : 'Ajouté aux favoris ❤️', 'info');
    } catch (e) { Toast.show(e.message, 'error'); }
  },
  loadFromServer: async () => {
    if (!Auth.isLoggedIn()) return;
    try {
      const favs = await apiFetch('/products/favorites/list');
      localStorage.setItem('tea_favs', JSON.stringify(favs.map(f => f.id)));
    } catch {}
  }
};

// ─── Toast ───────────────────────────────────────────────────
const Toast = {
  container: null,
  init: () => {
    Toast.container = document.createElement('div');
    Toast.container.className = 'toast-container';
    document.body.appendChild(Toast.container);
  },
  show: (msg, type = 'info') => {
    if (!Toast.container) Toast.init();
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: '✓', error: '✗', info: '🌸' };
    t.innerHTML = `<span>${icons[type] || '🌸'}</span><span>${msg}</span>`;
    Toast.container.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
};

// ─── Auth modal ──────────────────────────────────────────────
function openAuthModal() {
  let modal = document.getElementById('auth-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'auth-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <div>
            <h3 style="font-family:var(--font-title)" id="modal-title">Mon compte</h3>
            <p style="font-size:.85rem;color:var(--text-light)" id="modal-subtitle">Connectez-vous ou créez un compte</p>
          </div>
          <button class="modal-close" id="modal-close-btn">✕</button>
        </div>
        <div class="modal-tabs">
          <button class="modal-tab active" data-tab="login">Se connecter</button>
          <button class="modal-tab" data-tab="register">Créer un compte</button>
        </div>
        <!-- Login -->
        <div id="tab-login">
          <div class="form-group"><label class="form-label">Email</label><input id="login-email" type="email" class="form-input" placeholder="votre@email.fr"></div>
          <div class="form-group"><label class="form-label">Mot de passe</label><input id="login-password" type="password" class="form-input" placeholder="••••••••"></div>
          <p style="text-align:right;margin:-8px 0 12px">
            <a href="#" id="forgot-password-link" style="font-size:.8rem;color:var(--text-light)">Mot de passe oublié ?</a>
          </p>
          <div id="login-error" style="display:none;color:#d9534f;font-size:.85rem;padding:8px 12px;background:#f8d7da;border-radius:8px;margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" id="modal-login-btn">Se connecter</button>
        </div>
        <!-- Mot de passe oublié -->
        <div id="tab-forgot" style="display:none">
          <p style="font-size:.85rem;color:var(--text-light);margin:0 0 16px">Indiquez votre email, nous vous enverrons un lien pour réinitialiser votre mot de passe.</p>
          <div class="form-group"><label class="form-label">Email</label><input id="forgot-email" type="email" class="form-input" placeholder="votre@email.fr"></div>
          <div id="forgot-msg" style="display:none;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" id="modal-forgot-btn">Envoyer le lien</button>
          <p style="text-align:center;margin-top:14px"><a href="#" id="back-to-login-link" style="font-size:.85rem;color:var(--text-light)">← Retour à la connexion</a></p>
        </div>
        <!-- Register -->
        <div id="tab-register" style="display:none">
          <div class="form-row">
            <div class="form-group"><label class="form-label">Prénom *</label><input id="reg-fname" type="text" class="form-input" placeholder="Marie"></div>
            <div class="form-group"><label class="form-label">Nom *</label><input id="reg-lname" type="text" class="form-input" placeholder="Dupont"></div>
          </div>
          <div class="form-group">
            <label class="form-label">Pseudo *</label>
            <input id="reg-username" type="text" class="form-input" placeholder="MonPseudo123">
            <p style="font-size:.75rem;color:var(--text-light);margin-top:4px">Votre nom d'affichage visible par les autres</p>
          </div>
          <div class="form-group"><label class="form-label">Email *</label><input id="reg-email" type="email" class="form-input" placeholder="votre@email.fr"></div>
          <div class="form-group">
            <label class="form-label">Mot de passe *</label>
            <input id="reg-password" type="password" class="form-input" placeholder="Au moins 8 caractères">
            <div id="pw-strength-bar" style="height:5px;border-radius:4px;margin-top:6px;background:#e9e9e9;overflow:hidden">
              <div id="pw-strength-fill" style="height:100%;width:0;border-radius:4px;transition:width .3s,background .3s"></div>
            </div>
            <div id="pw-strength-label" style="font-size:.75rem;margin-top:4px;color:var(--text-light)"></div>
            <div style="font-size:.72rem;color:var(--text-light);margin-top:4px">8 car. min · 1 majuscule · 1 chiffre · 1 caractère spécial (!@#$…)</div>
          </div>
          <div class="form-group">
            <label class="form-label">Confirmer le mot de passe *</label>
            <input id="reg-confirm" type="password" class="form-input" placeholder="Répétez votre mot de passe">
            <div id="pw-match-label" style="font-size:.75rem;margin-top:4px"></div>
          </div>
          <div id="reg-error" style="display:none;color:#d9534f;font-size:.85rem;padding:8px 12px;background:#f8d7da;border-radius:8px;margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" id="modal-register-btn">Créer mon compte</button>
        </div>
        <!-- MFA — vérification à la connexion (compte ayant déjà activé le MFA) -->
        <div id="tab-mfa-verify" style="display:none">
          <div style="text-align:center;margin-bottom:16px">
            <div style="font-size:2rem;margin-bottom:8px">🔐</div>
            <p style="font-size:.85rem;color:var(--text-light)">Entrez le code à 6 chiffres généré par votre application d'authentification.</p>
          </div>
          <div class="form-group">
            <label class="form-label">Code de vérification</label>
            <input id="mfa-verify-code" type="text" inputmode="numeric" maxlength="6" class="form-input" placeholder="123456" style="text-align:center;font-size:1.3rem;letter-spacing:.3em">
          </div>
          <div id="mfa-verify-error" role="alert" aria-live="polite" style="display:none;color:#d9534f;font-size:.85rem;padding:8px 12px;background:#f8d7da;border-radius:8px;margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" id="mfa-verify-btn">Vérifier</button>
          <p style="text-align:center;margin-top:14px"><a href="#" id="mfa-use-recovery-link" style="font-size:.8rem;color:var(--text-light)">Appareil perdu ? Utiliser un code de secours</a></p>
        </div>
        <!-- MFA — activation forcée (admin sans MFA) ou volontaire (compte) -->
        <div id="tab-mfa-setup" style="display:none">
          <div id="mfa-setup-step-qr">
            <p style="font-size:.85rem;color:var(--text-light);margin-bottom:14px" id="mfa-setup-intro">Scannez ce QR code avec Google Authenticator, Authy ou 1Password, puis entrez le code affiché pour activer la double authentification.</p>
            <div style="text-align:center;margin-bottom:14px">
              <img id="mfa-qr-img" src="" alt="QR code MFA" style="width:180px;height:180px;border:1px solid var(--border);border-radius:12px;padding:8px;background:white">
            </div>
            <p style="font-size:.75rem;color:var(--text-light);text-align:center;margin-bottom:14px">Impossible de scanner ? Entrez ce code manuellement :<br><code id="mfa-secret-text" style="user-select:all;font-size:.8rem;background:var(--cream-dark);padding:4px 8px;border-radius:6px;display:inline-block;margin-top:6px"></code></p>
            <div class="form-group">
              <label class="form-label">Code de confirmation</label>
              <input id="mfa-setup-code" type="text" inputmode="numeric" maxlength="6" class="form-input" placeholder="123456" style="text-align:center;font-size:1.3rem;letter-spacing:.3em">
            </div>
            <div id="mfa-setup-error" role="alert" aria-live="polite" style="display:none;color:#d9534f;font-size:.85rem;padding:8px 12px;background:#f8d7da;border-radius:8px;margin-bottom:12px"></div>
            <button class="btn btn-primary btn-block" id="mfa-setup-confirm-btn">Activer la double authentification</button>
          </div>
          <div id="mfa-setup-step-recovery" style="display:none">
            <div style="text-align:center;margin-bottom:12px">
              <div style="font-size:2rem;margin-bottom:8px">✅</div>
              <p style="font-weight:700">Double authentification activée !</p>
              <p style="font-size:.82rem;color:var(--text-light);margin-top:6px">Notez ces codes de secours dans un endroit sûr — chacun ne peut être utilisé qu'une fois si vous perdez l'accès à votre application.</p>
            </div>
            <div id="mfa-recovery-codes-list" style="background:var(--cream);border-radius:10px;padding:14px;font-family:monospace;font-size:.85rem;line-height:1.9;text-align:center;margin-bottom:10px;user-select:all"></div>
            <button class="btn btn-secondary btn-block" id="mfa-recovery-copy-btn" type="button" style="margin-bottom:16px">📋 Copier les codes</button>
            <button class="btn btn-primary btn-block" id="mfa-recovery-done-btn">J'ai noté mes codes, continuer</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Bouton fermeture
    document.getElementById('modal-close-btn').addEventListener('click', function() {
      modal.classList.remove('open');
    });

    // Bouton connexion
    document.getElementById('modal-login-btn').addEventListener('click', doLogin);

    // Bouton inscription
    document.getElementById('modal-register-btn').addEventListener('click', doRegister);

    // Mot de passe oublié
    document.getElementById('forgot-password-link').addEventListener('click', function(e) {
      e.preventDefault();
      document.getElementById('forgot-email').value = document.getElementById('login-email').value.trim();
      document.getElementById('forgot-msg').style.display = 'none';
      modal.querySelector('.modal-tabs').style.display = 'none';
      document.getElementById('tab-login').style.display = 'none';
      document.getElementById('tab-register').style.display = 'none';
      document.getElementById('tab-forgot').style.display = '';
    });
    document.getElementById('back-to-login-link').addEventListener('click', function(e) {
      e.preventDefault();
      modal.querySelector('.modal-tabs').style.display = '';
      document.getElementById('tab-forgot').style.display = 'none';
      document.getElementById('tab-login').style.display = '';
    });
    document.getElementById('modal-forgot-btn').addEventListener('click', doForgotPassword);
    document.getElementById('forgot-email').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doForgotPassword();
    });

    // MFA — vérification à la connexion
    document.getElementById('mfa-verify-btn').addEventListener('click', doMfaVerify);
    document.getElementById('mfa-verify-code').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doMfaVerify();
    });
    document.getElementById('mfa-use-recovery-link').addEventListener('click', function(e) {
      e.preventDefault();
      var input = document.getElementById('mfa-verify-code');
      var usingRecovery = input.dataset.recovery === '1';
      input.dataset.recovery = usingRecovery ? '' : '1';
      input.value = '';
      if (usingRecovery) {
        input.setAttribute('maxlength', '6');
        input.setAttribute('placeholder', '123456');
        input.style.letterSpacing = '.3em';
        e.target.textContent = 'Appareil perdu ? Utiliser un code de secours';
      } else {
        input.removeAttribute('maxlength');
        input.setAttribute('placeholder', 'Code de secours');
        input.style.letterSpacing = 'normal';
        e.target.textContent = '← Revenir au code à 6 chiffres';
      }
    });

    // MFA — activation (setup)
    document.getElementById('mfa-setup-confirm-btn').addEventListener('click', doMfaSetupConfirm);
    document.getElementById('mfa-setup-code').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doMfaSetupConfirm();
    });
    document.getElementById('mfa-recovery-done-btn').addEventListener('click', function() {
      modal.classList.remove('open');
      setTimeout(() => location.reload(), 300);
    });
    document.getElementById('mfa-recovery-copy-btn').addEventListener('click', async function() {
      const codes = Array.from(document.getElementById('mfa-recovery-codes-list').children).map(function(el) { return el.textContent; }).join('\n');
      try {
        await navigator.clipboard.writeText(codes);
        Toast.show('Codes copiés dans le presse-papiers 📋', 'success');
      } catch (e) {
        Toast.show('Copie impossible — sélectionnez le texte manuellement', 'error');
      }
    });

    // Touche Entrée dans les champs
    document.getElementById('login-password').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doLogin();
    });
    document.getElementById('reg-password').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doRegister();
    });
    document.getElementById('reg-confirm').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') doRegister();
    });

    // Jauge de force du mot de passe
    document.getElementById('reg-password').addEventListener('input', function() {
      updatePasswordStrength(this.value);
      updatePasswordMatch();
    });
    document.getElementById('reg-confirm').addEventListener('input', updatePasswordMatch);

    // Tabs
    modal.querySelectorAll('.modal-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        modal.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.remove('active'); });
        tab.classList.add('active');
        document.getElementById('tab-login').style.display = tab.dataset.tab === 'login' ? '' : 'none';
        document.getElementById('tab-register').style.display = tab.dataset.tab === 'register' ? '' : 'none';
      });
    });

    // Clic hors du modal
    modal.addEventListener('click', function(e) {
      if (e.target === modal) modal.classList.remove('open');
    });
  }
  // Réinitialise l'état par défaut (onglet connexion) à chaque ouverture —
  // sinon un appel précédent à showMfaVerifyStep/showMfaSetupStep laisserait
  // le modal coincé sur cet écran au prochain openAuthModal(). Les appelants
  // qui veulent afficher directement une étape MFA le font juste après
  // (synchrone, donc sans flash visible).
  modal.querySelector('.modal-header h3').textContent = 'Mon compte';
  modal.querySelector('#modal-subtitle').textContent = 'Connectez-vous ou créez un compte';
  modal.querySelector('.modal-tabs').style.display = '';
  ['tab-login', 'tab-register', 'tab-forgot', 'tab-mfa-verify', 'tab-mfa-setup'].forEach(function(id) {
    document.getElementById(id).style.display = id === 'tab-login' ? '' : 'none';
  });
  modal.querySelectorAll('.modal-tab').forEach(function(t) { t.classList.toggle('active', t.dataset.tab === 'login'); });
  requestAnimationFrame(function() { modal.classList.add('open'); });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('modal-login-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Connexion…';
  try {
    const resp = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    // Compte avec MFA déjà actif → écran de vérification du code
    if (resp.mfa_required) { showMfaVerifyStep(resp.mfa_token); return; }
    // Compte admin sans MFA → activation obligatoire avant tout accès
    if (resp.mfa_setup_required) { showMfaSetupStep(resp.setup_token, true); return; }
    const { token, user } = resp;
    Auth.save(token, user);
    Toast.show(`Bienvenue, ${user.first_name} ! 🌸`, 'success');
    document.getElementById('auth-modal').classList.remove('open');
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    errEl.style.display = '';
    // Email non vérifié → proposer de renvoyer le lien
    if (e.message && e.message.includes('confirmer')) {
      errEl.innerHTML = `${e.message} <a href="#" onclick="resendVerification('${email}');return false;" style="color:#c8937a;text-decoration:underline;display:block;margin-top:6px">Renvoyer l'email de confirmation</a>`;
    } else {
      errEl.textContent = e.message;
    }
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ─── MFA — étapes dans le modal de connexion ──────────────────
function hideAllAuthSteps() {
  const modal = document.getElementById('auth-modal');
  modal.querySelector('.modal-tabs').style.display = 'none';
  ['tab-login', 'tab-register', 'tab-forgot', 'tab-mfa-verify', 'tab-mfa-setup'].forEach(function(id) {
    document.getElementById(id).style.display = 'none';
  });
}

function showMfaVerifyStep(mfaToken) {
  hideAllAuthSteps();
  const authModal = document.getElementById('auth-modal');
  authModal.querySelector('.modal-header h3').textContent = 'Vérification en deux étapes';
  authModal.querySelector('#modal-subtitle').textContent = 'Entrez le code de votre application d\'authentification';
  const step = document.getElementById('tab-mfa-verify');
  step.style.display = '';
  step.dataset.mfaToken = mfaToken;
  document.getElementById('mfa-verify-error').style.display = 'none';
  document.getElementById('mfa-verify-code').value = '';
  setTimeout(function() { document.getElementById('mfa-verify-code').focus(); }, 50);
}

async function doMfaVerify() {
  const step = document.getElementById('tab-mfa-verify');
  const mfaToken = step.dataset.mfaToken;
  const input = document.getElementById('mfa-verify-code');
  const errEl = document.getElementById('mfa-verify-error');
  const usingRecovery = input.dataset.recovery === '1';
  const body = { mfa_token: mfaToken };
  if (usingRecovery) body.recovery_code = input.value.trim();
  else body.code = input.value.trim();
  const btn = document.getElementById('mfa-verify-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Vérification…';
  try {
    const { token, user } = await apiFetch('/auth/mfa/verify', { method: 'POST', body });
    Auth.save(token, user);
    Toast.show(`Bienvenue, ${user.first_name} ! 🌸`, 'success');
    document.getElementById('auth-modal').classList.remove('open');
    setTimeout(() => location.reload(), 500);
  } catch (e) {
    errEl.style.display = '';
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// forceLogin : true quand appelé depuis le flux de connexion (compte admin
// sans MFA — activation obligatoire) ; false pour l'auto-activation
// volontaire depuis "Mon compte" (voir compte.html).
function showMfaSetupStep(setupToken, forceLogin) {
  hideAllAuthSteps();
  const modal = document.getElementById('auth-modal');
  modal.classList.add('open');
  modal.querySelector('.modal-header h3').textContent = 'Double authentification';
  modal.querySelector('#modal-subtitle').textContent = forceLogin
    ? 'Cette étape est obligatoire pour les comptes administrateur'
    : 'Scannez le QR code avec votre application d\'authentification';
  const step = document.getElementById('tab-mfa-setup');
  step.style.display = '';
  step.dataset.setupToken = setupToken || '';
  document.getElementById('mfa-setup-intro').textContent = forceLogin
    ? 'Compte administrateur : la double authentification est obligatoire. Scannez ce QR code avec Google Authenticator, Authy ou 1Password, puis entrez le code affiché.'
    : "Scannez ce QR code avec Google Authenticator, Authy ou 1Password, puis entrez le code affiché pour activer la double authentification.";
  document.getElementById('mfa-setup-step-qr').style.display = '';
  document.getElementById('mfa-setup-step-recovery').style.display = 'none';
  document.getElementById('mfa-setup-error').style.display = 'none';
  document.getElementById('mfa-setup-code').value = '';
  loadMfaQr(setupToken);
}

function loadMfaQr(setupToken) {
  const confirmBtn = document.getElementById('mfa-setup-confirm-btn');
  const errEl = document.getElementById('mfa-setup-error');
  confirmBtn.disabled = true;
  errEl.style.display = 'none';
  document.getElementById('mfa-qr-img').src = '';
  document.getElementById('mfa-secret-text').textContent = '…';
  initMfaSetupQr(setupToken).then(function(ok) {
    if (ok) { confirmBtn.disabled = false; return; }
    errEl.innerHTML = 'Impossible de charger le QR code (problème réseau). ' +
      '<a href="#" id="mfa-qr-retry-link" style="color:#c8937a;text-decoration:underline">Réessayer</a>';
    errEl.style.display = '';
    const retry = document.getElementById('mfa-qr-retry-link');
    if (retry) retry.addEventListener('click', function(e) { e.preventDefault(); loadMfaQr(setupToken); });
  });
}

async function initMfaSetupQr(setupToken) {
  try {
    const body = setupToken ? { setup_token: setupToken } : {};
    const data = await apiFetch('/auth/mfa/setup/init', { method: 'POST', body });
    document.getElementById('mfa-qr-img').src = data.qr;
    document.getElementById('mfa-secret-text').textContent = data.secret;
    return true;
  } catch (e) {
    Toast.show(e.message, 'error');
    return false;
  }
}

async function doMfaSetupConfirm() {
  const step = document.getElementById('tab-mfa-setup');
  const setupToken = step.dataset.setupToken;
  const code = document.getElementById('mfa-setup-code').value.trim();
  const errEl = document.getElementById('mfa-setup-error');
  const btn = document.getElementById('mfa-setup-confirm-btn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Activation…';
  try {
    const body = setupToken ? { setup_token: setupToken, code } : { code };
    const data = await apiFetch('/auth/mfa/setup/confirm', { method: 'POST', body });
    Auth.save(data.token, data.user);
    document.getElementById('mfa-setup-step-qr').style.display = 'none';
    const list = document.getElementById('mfa-recovery-codes-list');
    list.innerHTML = data.recovery_codes.map(function(c) { return `<div>${c}</div>`; }).join('');
    document.getElementById('mfa-setup-step-recovery').style.display = '';
  } catch (e) {
    errEl.style.display = '';
    errEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

async function resendVerification(email) {
  try {
    await apiFetch('/auth/resend-verification', { method: 'POST', body: { email } });
    Toast.show('📧 Email de confirmation renvoyé !', 'success');
  } catch (e) { Toast.show(e.message, 'error'); }
}

async function doForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  const msgEl = document.getElementById('forgot-msg');
  const btn = document.getElementById('modal-forgot-btn');
  if (!email) {
    msgEl.style.cssText = 'display:block;color:#d9534f;background:#f8d7da;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px';
    msgEl.textContent = 'Merci de renseigner votre email';
    return;
  }
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Envoi…';
  try {
    const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
    msgEl.style.cssText = 'display:block;color:#3d6b4f;background:#e3f0e7;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px';
    msgEl.textContent = data.message || 'Si un compte existe avec cet email, un lien vient de lui être envoyé.';
  } catch (e) {
    msgEl.style.cssText = 'display:block;color:#d9534f;background:#f8d7da;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px';
    msgEl.textContent = e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

// ─── Mot de passe oublié — espace admin ───────────────────────
// Fonction partagée appelée depuis le lien "Mot de passe oublié ?" des 8
// pages admin (admin-guard), pour éviter de dupliquer 8x cette logique.
function openAdminForgotPassword() {
  let modal = document.getElementById('admin-forgot-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'admin-forgot-modal';
    modal.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;align-items:center;justify-content:center';
    modal.innerHTML = `
      <div style="background:white;border-radius:16px;padding:32px;max-width:380px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.2)">
        <h3 style="margin:0 0 8px">🔑 Mot de passe oublié</h3>
        <p style="font-size:.85rem;color:var(--text-light);margin:0 0 16px">Indiquez votre email admin, un lien de réinitialisation vous sera envoyé.</p>
        <div class="form-group"><label class="form-label">Email</label><input type="email" id="admin-forgot-email" class="form-input" placeholder="victorine@..."></div>
        <div id="admin-forgot-msg" style="display:none;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px"></div>
        <div style="display:flex;gap:12px">
          <button class="btn btn-secondary" id="admin-forgot-cancel">Fermer</button>
          <button class="btn btn-primary" id="admin-forgot-send">Envoyer le lien</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    document.getElementById('admin-forgot-cancel').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
    document.getElementById('admin-forgot-send').addEventListener('click', async function() {
      const email = document.getElementById('admin-forgot-email').value.trim();
      const msgEl = document.getElementById('admin-forgot-msg');
      const btn = this;
      if (!email) return;
      btn.disabled = true;
      const original = btn.textContent;
      btn.textContent = 'Envoi…';
      try {
        const data = await apiFetch('/auth/forgot-password', { method: 'POST', body: { email } });
        msgEl.style.cssText = 'display:block;color:#3d6b4f;background:#e3f0e7;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px';
        msgEl.textContent = data.message || 'Si un compte existe avec cet email, un lien vient de lui être envoyé.';
      } catch (e) {
        msgEl.style.cssText = 'display:block;color:#d9534f;background:#f8d7da;font-size:.85rem;padding:8px 12px;border-radius:8px;margin-bottom:12px';
        msgEl.textContent = e.message;
      } finally {
        btn.disabled = false;
        btn.textContent = original;
      }
    });
    document.getElementById('admin-forgot-email').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('admin-forgot-send').click();
    });
  }
  document.getElementById('admin-forgot-msg').style.display = 'none';
  document.getElementById('admin-forgot-email').value = '';
  modal.style.display = 'flex';
}

// ─── Jauge force mot de passe ─────────────────────────────────
function getPasswordStrength(pw) {
  if (!pw) return { score: 0, label: '', color: '' };
  var score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: 'Très faible', color: '#d9534f', pct: 15 };
  if (score === 2) return { score, label: 'Faible', color: '#e67e22', pct: 35 };
  if (score === 3) return { score, label: 'Moyen', color: '#f0ad4e', pct: 60 };
  if (score === 4) return { score, label: 'Fort', color: '#5cb85c', pct: 80 };
  return { score, label: 'Très fort 💪', color: '#27ae60', pct: 100 };
}

function updatePasswordStrength(pw) {
  var fill  = document.getElementById('pw-strength-fill');
  var label = document.getElementById('pw-strength-label');
  if (!fill || !label) return;
  var s = getPasswordStrength(pw);
  fill.style.width = (pw ? s.pct + '%' : '0');
  fill.style.background = s.color;
  label.textContent = pw ? s.label : '';
  label.style.color = s.color;
}

function updatePasswordMatch() {
  var pw  = document.getElementById('reg-password') ? document.getElementById('reg-password').value : '';
  var pw2 = document.getElementById('reg-confirm')  ? document.getElementById('reg-confirm').value  : '';
  var el  = document.getElementById('pw-match-label');
  if (!el || !pw2) { if (el) el.textContent = ''; return; }
  if (pw === pw2) { el.textContent = '✓ Les mots de passe correspondent'; el.style.color = '#27ae60'; }
  else            { el.textContent = '✗ Les mots de passe ne correspondent pas'; el.style.color = '#d9534f'; }
}

async function doRegister() {
  const first_name = document.getElementById('reg-fname').value.trim();
  const last_name  = document.getElementById('reg-lname').value.trim();
  const username   = document.getElementById('reg-username').value.trim();
  const email      = document.getElementById('reg-email').value.trim();
  const password   = document.getElementById('reg-password').value;
  const confirm    = document.getElementById('reg-confirm').value;
  const errEl      = document.getElementById('reg-error');
  errEl.style.display = 'none';

  // Validations client
  if (!username) { errEl.textContent = 'Le pseudo est obligatoire'; errEl.style.display = ''; return; }
  if (password !== confirm) { errEl.textContent = 'Les mots de passe ne correspondent pas'; errEl.style.display = ''; return; }
  const s = getPasswordStrength(password);
  if (s.score < 4) { errEl.textContent = 'Mot de passe trop faible : 8 car. min, 1 majuscule, 1 chiffre, 1 caractère spécial'; errEl.style.display = ''; return; }

  try {
    const data = await apiFetch('/auth/register', { method: 'POST', body: { email, password, first_name, last_name, username } });

    if (data.pending_verification) {
      // Compte créé — email de confirmation envoyé
      document.getElementById('auth-modal').classList.remove('open');
      Toast.show('📧 Un email de confirmation vous a été envoyé !', 'success');
      // Afficher un message persistant sur la page
      const banner = document.createElement('div');
      banner.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);background:#fff;border:2px solid #c8937a;border-radius:12px;padding:20px 28px;z-index:9999;text-align:center;max-width:420px;box-shadow:0 4px 20px rgba(0,0,0,.12)';
      banner.innerHTML = `<div style="font-size:2rem;margin-bottom:8px">📧</div><strong style="color:#5a3e2b">Vérifiez votre boîte mail !</strong><p style="color:#6b5547;margin:8px 0 0;font-size:.9rem">Cliquez sur le lien envoyé à <b>${email}</b> pour activer votre compte.</p>`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 8000);
      return;
    }

    // Connexion directe (fallback si email déjà vérifié)
    if (data.token) {
      Auth.save(data.token, data.user);
      Toast.show(`Bienvenue ${data.user.first_name} ! 🎉`, 'success');
      document.getElementById('auth-modal').classList.remove('open');
      setTimeout(() => location.reload(), 500);
    }
  } catch (e) { errEl.textContent = e.message; errEl.style.display = ''; }
}

// ─── Header init ─────────────────────────────────────────────
function initHeader() {
  Cart.updateBadge();
  const userBtn = document.getElementById('user-btn');
  if (userBtn) {
    if (Auth.isLoggedIn()) {
      const u = Auth.getUser();
      if (u && u.avatar_url) {
        userBtn.innerHTML = `<img src="${u.avatar_url}" style="width:32px;height:32px;object-fit:cover;border-radius:50%;display:block" alt="${u.first_name}">`;
        userBtn.style.padding = '0';
        userBtn.style.overflow = 'hidden';
        userBtn.style.borderRadius = '50%';
      } else {
        userBtn.innerHTML = `<span style="font-size:.9rem;font-weight:700;color:var(--rose-dark)">${u.first_name[0]}${u.last_name[0]}</span>`;
      }
      userBtn.onclick = () => window.location.href = '/compte.html';
    } else {
      userBtn.onclick = openAuthModal;
    }
  }
  // Lien Admin dans la nav (admin uniquement) — chemin récupéré depuis le serveur
  if (Auth.isAdmin()) {
    const nav = document.querySelector('.nav');
    if (nav && !nav.querySelector('.admin-nav-link')) {
      const adminLink = document.createElement('a');
      adminLink.className = 'admin-nav-link';
      adminLink.textContent = '⚙️ Admin';
      adminLink.style.cssText = 'color:var(--rose-dark)!important;font-weight:700;border:1px solid var(--rose-dark);border-radius:6px;padding:4px 10px;font-size:.85rem';
      // Récupérer le chemin admin depuis le serveur (suit automatiquement la variable ADMIN_PATH)
      apiFetch('/admin-path').then(d => {
        adminLink.href = '/' + d.path + '/';
      }).catch(() => { adminLink.href = '/gestion-tea/'; });
      nav.appendChild(adminLink);
    }
  }
  // Highlight active nav
  document.querySelectorAll('.nav a').forEach(a => {
    if (a.href === location.href || location.pathname.startsWith(a.pathname) && a.pathname !== '/') {
      a.classList.add('active');
    }
  });
}

// ─── Cache produits pour event delegation ────────────────────
if (!window._pcache) window._pcache = {};

// ─── Helper : rendu des étoiles ───────────────────────────────
function renderStars(rating) {
  return [1,2,3,4,5].map(i => {
    if (rating >= i - 0.25) return '<span class="star-full">★</span>';
    if (rating >= i - 0.75) return '<span class="star-half">★</span>';
    return '<span class="star-empty">★</span>';
  }).join('');
}

// ─── Product card renderer ────────────────────────────────────
function renderProductCard(p) {
  window._pcache[p.id] = p;

  const img = p.images && p.images.length > 0
    ? `<img src="${p.images[0]}" alt="${p.name}" loading="lazy">`
    : '';
  const placeholder = `<div class="product-card-placeholder" ${img ? 'style="display:none"' : ''}>🧶</div>`;
  const isFav = Favorites.has(p.id);
  const inStock = p.stock > 0;
  const tags = Array.isArray(p.tags) && p.tags.length > 0
    ? p.tags.slice(0, 3).map(t => `<span class="product-card-tag">${t}</span>`).join('')
    : '';

  // Badge "Nouveau" si créé il y a moins de 30 jours
  const isNew = p.created_at && (Date.now() - new Date(p.created_at).getTime()) < 30 * 24 * 60 * 60 * 1000;
  // Urgence stock (≤ 3 en stock)
  const isLowStock = inStock && p.stock <= 3;
  // Note moyenne
  const avgRating = p.avg_rating ? Number(p.avg_rating) : 0;
  const reviewCount = Number(p.review_count || 0);

  return `
    <div class="card product-card" data-id="${p.id}">
      <a class="card-full-link" href="/produit.html?id=${p.id}" aria-label="Voir ${p.name}"></a>
      <a href="/produit.html?id=${p.id}">
        <div class="product-card-img">${img}${placeholder}</div>
        ${!inStock ? '<span class="out-of-stock">Rupture de stock</span>' : ''}
        ${p.is_featured && !isNew ? '<span class="badge-featured">✦ Coup de cœur</span>' : ''}
        ${isNew ? '<span class="badge-new-product">Nouveau</span>' : ''}
      </a>
      <div class="product-card-body">
        <div class="product-card-cat">${p.category_name || ''}</div>
        <a href="/produit.html?id=${p.id}">
          <div class="product-card-name">${p.name}</div>
        </a>
        ${reviewCount > 0 ? `<div class="product-card-stars">${renderStars(avgRating)}<span class="stars-count">${avgRating.toFixed(1)} (${reviewCount})</span></div>` : ''}
        ${isLowStock ? `<div class="stock-urgency">⚡ Plus que ${p.stock} en stock !</div>` : ''}
        <div class="product-card-price">${p.price.toFixed(2)} €</div>
        <div class="product-card-bottom">
          ${tags ? `<div class="product-card-tags">${tags}</div>` : ''}
          <div class="product-card-footer">
            <button class="btn btn-primary btn-sm card-add-btn" data-pid="${p.id}" ${!inStock ? 'disabled' : ''}>
              <span class="btn-icon">🛒</span><span class="btn-label"> Ajouter</span>
            </button>
            <button class="favorite-btn ${isFav ? 'active' : ''} card-fav-btn" data-pid="${p.id}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
              ${isFav ? '❤️' : '🤍'}
            </button>
          </div>
        </div>
      </div>
    </div>`;
}

// ─── Event delegation globale pour les cartes produit ────────
document.addEventListener('click', function(e) {
  // Bouton "Ajouter au panier"
  var addBtn = e.target.closest('.card-add-btn');
  if (addBtn && !addBtn.disabled) {
    var pid = Number(addBtn.dataset.pid);
    var product = window._pcache[pid];
    if (product) Cart.add(product);
    return;
  }
  // Bouton favoris
  var favBtn = e.target.closest('.card-fav-btn');
  if (favBtn) {
    var pid2 = Number(favBtn.dataset.pid);
    Favorites.toggle(pid2, favBtn);
    return;
  }
});

// ─── Format date ─────────────────────────────────────────────
function formatDate(str) {
  return new Date(str).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── Bouton retour en haut ────────────────────────────────────
function initBackToTop() {
  const btn = document.createElement('button');
  btn.id = 'back-to-top';
  btn.setAttribute('aria-label', 'Retour en haut de page');
  btn.innerHTML = '↑';
  btn.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
  document.body.appendChild(btn);
  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 400);
  }, { passive: true });
}

// Note : le bandeau cookies RGPD est géré plus haut dans ce fichier
// (initCookieConsent / showCookieBanner / setCookieConsent, clé
// tea_cookie_consent). Il existait ici un second système entièrement
// dupliqué (même nom de fonction setCookieConsent, clé localStorage
// différente 'cookie_consent') qui écrasait silencieusement le premier par
// hoisting JS et ne chargeait jamais réellement GTM (pas d'appel à
// loadGTM()) — supprimé pour ne garder qu'une seule implémentation.

// ─── Pied de page — plié/déplié sur mobile ─────────────────────
// Partagée ici (plutôt que dupliquée dans chaque page) depuis que le pied de
// page complet (colonnes Boutique/Mon compte/Infos) a été étendu à toutes
// les pages publiques et non plus seulement à l'accueil.
function toggleFooterCol(h4) {
  if (window.innerWidth > 768) return;
  h4.closest('.footer-col').classList.toggle('open');
}

// ─── Init on load ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  initHeader();
  Favorites.loadFromServer();
  initBackToTop();
  // Appelé globalement ici (et non plus seulement sur index.html) car la
  // recherche du header n'existait que sur la page d'accueil : le markup
  // .header-search-wrap a été étendu à toutes les pages publiques, il faut
  // donc initialiser le JS partout. La fonction se protège déjà si le
  // markup est absent (ex: pages admin).
  initHeaderSearch();
  // Année du pied de page — partagé pour toutes les pages utilisant le
  // pied de page complet (id="footer-year").
  const fy = document.getElementById('footer-year');
  if (fy) fy.textContent = new Date().getFullYear();
});
