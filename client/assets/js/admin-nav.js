/* ============================================================
   Tout en Aiguilles — Sidebar admin partagée
   Évite de dupliquer le HTML de la sidebar dans chaque page admin.
   Nécessite un <div id="admin-sidebar-mount"></div> dans le HTML,
   placé juste avant ce script.
   ============================================================ */

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

// Exécution immédiate : ce script est placé juste après le mount point,
// donc le div existe déjà dans le DOM au moment où ce code s'exécute.
renderAdminSidebar();
