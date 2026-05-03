# 🧶 Tout en Aiguilles — Site e-commerce

Site e-commerce artisanal pour Victorine — créations crochet & couture.

## ✨ Fonctionnalités

| Module | Détail |
|--------|--------|
| 🛍️ Boutique | Catalogue filtrable par catégorie/type/prix, recherche en temps réel |
| 🛒 Panier | Panier persistant (localStorage), checkout Stripe sécurisé |
| 👤 Comptes | Inscription/connexion JWT, profil, historique commandes, favoris |
| 📝 Actualités | Blog avec éditeur riche, photos, publication/brouillon |
| 🔐 Admin | Tableau de bord, gestion produits + import Excel, suivi commandes |
| 💳 Paiement | Stripe Checkout (CB, Visa, Mastercard) — fonctionne aussi en mode démo |

---

## 🚀 Installation & démarrage

### Prérequis
- Node.js 18+ — [nodejs.org](https://nodejs.org)

### Étapes

```bash
# 1. Entrer dans le dossier
cd tout-en-aiguilles

# 2. Installer les dépendances
npm install

# 3. Configurer l'environnement
cp .env.example .env
# Éditez .env avec votre éditeur de texte

# 4. Démarrer
npm start
# → Ouvre http://localhost:3000
```

Le site s'ouvre sur **http://localhost:3000**

---

## ⚙️ Configuration (.env)

```env
PORT=3000
JWT_SECRET=votre_cle_secrete_unique      # CHANGEZ EN PRODUCTION

# Stripe (optionnel pour démarrer)
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

> **Sans clé Stripe** : le site fonctionne en mode démo — les commandes sont enregistrées sans paiement réel.

---

## 👑 Créer un compte administrateur

Après le premier `npm start`, lancez dans un terminal :

```bash
node -e "
const db = require('better-sqlite3')('./data/toutenaiguilles.db');
const bcrypt = require('bcryptjs');
db.prepare(\"UPDATE users SET role='admin' WHERE email=?\").run('votre@email.fr');
console.log('Admin OK');
"
```

Ou via un script rapide :

```bash
node scripts/make-admin.js votre@email.fr
```

---

## 📁 Structure du projet

```
tout-en-aiguilles/
├── server/
│   ├── index.js              ← Serveur Express
│   ├── db/
│   │   ├── schema.sql        ← Schéma + données initiales
│   │   └── database.js       ← Connexion SQLite
│   ├── routes/
│   │   ├── auth.js           ← /api/auth/*
│   │   ├── products.js       ← /api/products/*
│   │   ├── orders.js         ← /api/orders/*
│   │   └── news.js           ← /api/news/*
│   └── middleware/auth.js    ← JWT guard
├── client/
│   ├── index.html            ← Accueil / vitrine
│   ├── boutique.html         ← Catalogue avec filtres
│   ├── produit.html          ← Fiche produit
│   ├── panier.html           ← Panier + checkout
│   ├── compte.html           ← Espace client
│   ├── actualites.html       ← Blog
│   ├── commande-confirmee.html
│   ├── admin/
│   │   ├── index.html        ← Dashboard admin
│   │   ├── produits.html     ← Gestion produits + import Excel
│   │   ├── commandes.html    ← Suivi commandes
│   │   └── actualites.html   ← Gestion articles
│   └── assets/
│       ├── css/style.css     ← Design system complet
│       └── js/main.js        ← JavaScript partagé
├── data/                     ← Base de données SQLite (auto-créé)
├── .env.example
└── package.json
```

---

## 📊 Import Excel des produits

Dans l'admin → Produits → **Importer Excel**, glissez un fichier `.xlsx` avec ces colonnes :

| Colonne | Type | Exemple |
|---------|------|---------|
| `Nom` | Texte | Doudou Lapin Rose |
| `Prix` | Nombre | 28.50 |
| `Stock` | Entier | 5 |
| `Catégorie` | Texte (doit exister en base) | Doudous & Peluches |
| `Description` | Texte | Un adorable doudou… |
| `Tags` | Texte, virgules | bébé,cadeau,crochet |
| `Mis en avant` | oui/non | oui |

---

## 🌐 Déploiement en production

### Option recommandée : Railway.app
1. Créez un compte sur [railway.app](https://railway.app)
2. Connectez votre GitHub
3. Ajoutez les variables d'environnement dans Railway
4. Déployez !

### Option VPS (ex: OVH, DigitalOcean)
```bash
# Installer PM2 pour garder le serveur actif
npm install -g pm2
pm2 start server/index.js --name toutenaiguilles
pm2 startup && pm2 save
```

### Stripe en production
1. Sur [dashboard.stripe.com](https://dashboard.stripe.com), passez en mode **Live**
2. Remplacez `sk_test_...` par `sk_live_...` dans `.env`
3. Configurez le webhook : `https://votre-domaine.fr/api/orders/webhook`

---

## 🎨 Personnalisation du design

Le fichier `client/assets/css/style.css` contient toutes les variables CSS :

```css
:root {
  --rose:       #E8A4B0;  /* Rose principal */
  --sage:       #8FAF8A;  /* Vert sauge */
  --cream:      #FDF6EF;  /* Fond crème */
  --rose-dark:  #C0718A;  /* Boutons, accents */
  --sage-dark:  #5A8A54;  /* Accents verts */
}
```

---

## 📞 Support

Des questions ? Contactez [contact@toutenaiguilles.fr](mailto:contact@toutenaiguilles.fr)

---

*Fait avec ❤️ pour Victorine — Tout en Aiguilles 🌸*
