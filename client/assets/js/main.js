/* ============================================================
   Tout en Aiguilles — JavaScript partagé
   ============================================================ */

const API = '/api';

// ─── Mobile nav ──────────────────────────────────────────────
function openMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (nav) { nav.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeMobileNav() {
  const nav = document.getElementById('mobile-nav');
  if (nav) { nav.classList.remove('open'); document.body.style.overflow = ''; }
}
// Fermer avec la touche Escape
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMobileNav(); });

// ─── Auth ────────────────────────────────────────────────────
const Auth = {
  getToken: () => localStorage.getItem('tea_token'),
  getUser:  () => { try { return JSON.parse(localStorage.getItem('tea_user')); } catch { return null; } },
  isLoggedIn: () => !!localStorage.getItem('tea_token'),
  isAdmin:  () => { const u = Auth.getUser(); return u && u.role === 'admin'; },
  save: (token, user) => { localStorage.setItem('tea_token', token); localStorage.setItem('tea_user', JSON.stringify(user)); },
  logout: () => { localStorage.removeItem('tea_token'); localStorage.removeItem('tea_user'); window.location.href = '/'; },
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
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

async function apiFetchForm(path, formData, method = 'POST') {
  const headers = {};
  const t = Auth.getToken();
  if (t) headers['Authorization'] = `Bearer ${t}`;
  const res = await fetch(API + path, { method, headers, body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Erreur serveur');
  return data;
}

// ─── Cart ────────────────────────────────────────────────────
const Cart = {
  get: () => { try { return JSON.parse(localStorage.getItem('tea_cart') || '[]'); } catch { return []; } },
  save: (items) => { localStorage.setItem('tea_cart', JSON.stringify(items)); Cart.updateBadge(); },
  add: (product, qty = 1) => {
    const items = Cart.get();
    const idx = items.findIndex(i => i.product_id === product.id);
    if (idx >= 0) items[idx].qty += qty;
    else items.push({ product_id: product.id, name: product.name, price: product.price, qty, image: (product.images || [])[0] || '' });
    Cart.save(items);
    Toast.show(`${product.name} ajouté au panier 🛒`, 'success');
  },
  remove: (product_id) => { Cart.save(Cart.get().filter(i => i.product_id !== product_id)); },
  updateQty: (product_id, qty) => {
    if (qty <= 0) return Cart.remove(product_id);
    const items = Cart.get(); const idx = items.findIndex(i => i.product_id === product_id);
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
            <h3 style="font-family:var(--font-title)">Mon compte</h3>
            <p style="font-size:.85rem;color:var(--text-light)">Connectez-vous ou créez un compte</p>
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
          <div id="login-error" style="display:none;color:#d9534f;font-size:.85rem;padding:8px 12px;background:#f8d7da;border-radius:8px;margin-bottom:12px"></div>
          <button class="btn btn-primary btn-block" id="modal-login-btn">Se connecter</button>
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
  requestAnimationFrame(function() { modal.classList.add('open'); });
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  try {
    const { token, user } = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
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
  }
}

async function resendVerification(email) {
  try {
    await apiFetch('/auth/resend-verification', { method: 'POST', body: { email } });
    Toast.show('📧 Email de confirmation renvoyé !', 'success');
  } catch (e) { Toast.show(e.message, 'error'); }
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

// ─── Init on load ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  initHeader();
  Favorites.loadFromServer();
  initBackToTop();
});
