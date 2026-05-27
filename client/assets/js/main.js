/* ============================================================
   Tout en Aiguilles — JavaScript partagé
   ============================================================ */

const API = '/api';

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
            <div class="form-group"><label class="form-label">Prénom</label><input id="reg-fname" type="text" class="form-input" placeholder="Marie"></div>
            <div class="form-group"><label class="form-label">Nom</label><input id="reg-lname" type="text" class="form-input" placeholder="Dupont"></div>
          </div>
          <div class="form-group"><label class="form-label">Email</label><input id="reg-email" type="email" class="form-input" placeholder="votre@email.fr"></div>
          <div class="form-group"><label class="form-label">Mot de passe</label><input id="reg-password" type="password" class="form-input" placeholder="Au moins 6 caractères"></div>
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

async function doRegister() {
  const first_name = document.getElementById('reg-fname').value.trim();
  const last_name  = document.getElementById('reg-lname').value.trim();
  const email      = document.getElementById('reg-email').value.trim();
  const password   = document.getElementById('reg-password').value;
  const errEl      = document.getElementById('reg-error');
  try {
    const data = await apiFetch('/auth/register', { method: 'POST', body: { email, password, first_name, last_name } });

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
      userBtn.innerHTML = `<span style="font-size:.9rem;font-weight:700;color:var(--rose-dark)">${u.first_name[0]}${u.last_name[0]}</span>`;
      userBtn.onclick = () => window.location.href = '/compte.html';
    } else {
      userBtn.onclick = openAuthModal;
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

// ─── Product card renderer ────────────────────────────────────
function renderProductCard(p) {
  // Stocker le produit dans le cache global pour les event listeners
  window._pcache[p.id] = p;

  const img = p.images && p.images.length > 0
    ? `<img src="${p.images[0]}" alt="${p.name}" loading="lazy">`
    : '';
  const placeholder = `<div class="product-card-placeholder" ${img ? 'style="display:none"' : ''}>🧶</div>`;
  const isFav = Favorites.has(p.id);
  const inStock = p.stock > 0;

  return `
    <div class="card product-card" data-id="${p.id}">
      <a href="/produit.html?id=${p.id}">
        <div class="product-card-img">${img}${placeholder}</div>
        ${!inStock ? '<span class="out-of-stock">Rupture de stock</span>' : ''}
        ${p.is_featured ? '<span class="badge-new">✦ Coup de cœur</span>' : ''}
      </a>
      <div class="product-card-body">
        <div class="product-card-cat">${p.category_name || ''}</div>
        <a href="/produit.html?id=${p.id}">
          <div class="product-card-name">${p.name}</div>
        </a>
        <div class="product-card-price">${p.price.toFixed(2)} €</div>
        <div class="product-card-footer">
          <button class="btn btn-primary btn-sm card-add-btn" style="flex:1" data-pid="${p.id}" ${!inStock ? 'disabled' : ''}>
            ${inStock ? '🛒 Ajouter' : 'Indisponible'}
          </button>
          <button class="favorite-btn ${isFav ? 'active' : ''} card-fav-btn" data-pid="${p.id}" title="${isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}">
            ${isFav ? '❤️' : '🤍'}
          </button>
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

// ─── Init on load ─────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  Toast.init();
  initHeader();
  Favorites.loadFromServer();
});
