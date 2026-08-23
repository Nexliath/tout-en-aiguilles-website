// ─── Avis de lancement (générés) ──────────────────────────────
// Ajoute 2 à 4 avis déjà approuvés par produit actif n'ayant pas encore
// d'avis, pour donner au site un aspect "vivant" dès le lancement.
// Protégé par la variable d'env RUN_FAKE_REVIEWS_SEED=true (opt-in explicite,
// ne tourne jamais tout seul — même logique que RUN_SEED pour les produits).

const DUMMY_PASSWORD_HASH = '$2b$10$joXaSP7uDNKc0MolljZj8etjXaX.QA.cjrRMWXhlqHQd.U0uVyOSa'; // hash inutilisable, aucun mot de passe ne correspond

const REVIEWERS = [
  { first_name: 'Camille',   last_name: 'Dubois',   email: 'camille.dubois83@gmail.com' },
  { first_name: 'Julie',     last_name: 'Martin',    email: 'julie.martin47@gmail.com' },
  { first_name: 'Sophie',    last_name: 'Bernard',   email: 'sophie.bernard22@gmail.com' },
  { first_name: 'Marion',    last_name: 'Petit',     email: 'marion.petit91@gmail.com' },
  { first_name: 'Emilie',    last_name: 'Robert',    email: 'emilie.robert56@gmail.com' },
  { first_name: 'Claire',    last_name: 'Richard',   email: 'claire.richard14@gmail.com' },
  { first_name: 'Laura',     last_name: 'Durand',    email: 'laura.durand38@gmail.com' },
  { first_name: 'Amandine',  last_name: 'Leroy',     email: 'amandine.leroy72@gmail.com' },
  { first_name: 'Sarah',     last_name: 'Moreau',    email: 'sarah.moreau29@gmail.com' },
  { first_name: 'Pauline',   last_name: 'Simon',     email: 'pauline.simon65@gmail.com' },
  { first_name: 'Emma',      last_name: 'Laurent',   email: 'emma.laurent18@gmail.com' },
  { first_name: 'Charlotte', last_name: 'Lefebvre',  email: 'charlotte.lefebvre44@gmail.com' },
  { first_name: 'Manon',     last_name: 'Michel',    email: 'manon.michel77@gmail.com' },
  { first_name: 'Lea',       last_name: 'Garcia',    email: 'lea.garcia33@gmail.com' },
  { first_name: 'Oceane',    last_name: 'Roux',      email: 'oceane.roux59@gmail.com' },
  { first_name: 'Alicia',    last_name: 'David',     email: 'alicia.david12@gmail.com' },
  { first_name: 'Justine',   last_name: 'Bertrand',  email: 'justine.bertrand88@gmail.com' },
  { first_name: 'Mathilde',  last_name: 'Morel',     email: 'mathilde.morel25@gmail.com' },
];

const COMMENTS = {
  crochet: [
    { rating: 5, comment: "Adorable ! La qualité du crochet est vraiment impressionnante, on sent tout l'amour mis dans la confection. Mon fils ne la lâche plus 🥰" },
    { rating: 5, comment: "Reçu rapidement et emballé avec soin. La peluche est encore plus mignonne en vrai que sur les photos, je recommande !" },
    { rating: 5, comment: "Superbe cadeau de naissance, la maman a été touchée par autant de douceur. Un vrai coup de cœur." },
    { rating: 4, comment: "Très belle finition, les couleurs sont fidèles aux photos. Parfait pour la chambre de bébé." },
    { rating: 5, comment: "Ma fille l'a adoptée immédiatement, elle dort avec toutes les nuits. Merci pour ce beau travail artisanal !" },
    { rating: 5, comment: "Peluche toute douce et bien rembourrée, on voit que c'est fait main avec soin. Je recommande vivement cette boutique." },
    { rating: 4, comment: "Exactement ce que je cherchais pour un cadeau original et fait main. Livraison rapide en plus !" },
    { rating: 5, comment: "Qualité au rendez-vous, les finitions sont impeccables. On sent le savoir-faire." },
    { rating: 4, comment: "Un adorable doudou, très doux et bien fini. Le rapport qualité-prix est top pour du fait main." },
    { rating: 5, comment: "Coup de cœur total pour cette création, les couleurs sont magnifiques et la taille parfaite pour un bébé." },
    { rating: 3, comment: "Jolie peluche, un peu plus petite que ce que j'imaginais mais la qualité est là." },
  ],
  couture_sacs: [
    { rating: 5, comment: "Sac vraiment magnifique, la couture est nickel et le tissu de belle qualité. Je suis ravie de mon achat !" },
    { rating: 5, comment: "Très joli tote bag, pratique au quotidien et solide. Exactement conforme aux photos." },
    { rating: 5, comment: "Superbe cabas, spacieux et bien fini. On sent que chaque détail a été soigné." },
    { rating: 4, comment: "Parfait pour les courses ou la plage, le tissu est épais et de qualité. Je recommande cette créatrice les yeux fermés." },
    { rating: 5, comment: "Très satisfaite de mon achat, le sac est encore plus beau en vrai. Couture impeccable." },
    { rating: 4, comment: "Bel objet artisanal, robuste et esthétique. Reçu rapidement et bien emballé." },
    { rating: 5, comment: "Sac de très bonne facture, les finitions sont soignées. Idéal en cadeau ou pour soi." },
    { rating: 5, comment: "Jolie pièce unique, on sent le travail fait main. Je repasserai commande !" },
    { rating: 4, comment: "Très pratique et joli, le motif est encore plus beau en vrai. Merci pour ce bel article." },
    { rating: 5, comment: "Qualité au top, tissu épais et couture solide. Un vrai coup de cœur pour ce sac fait main." },
    { rating: 3, comment: "Beau sac, la couleur est un peu différente des photos mais reste très joli." },
  ],
  couture_accessoires: [
    { rating: 5, comment: "Très pratique au quotidien, la couture est nickel. Je recommande !" },
    { rating: 5, comment: "Article zéro déchet parfait, doux et bien fini. Ravie de mon achat." },
    { rating: 4, comment: "Exactement ce qu'il me fallait, qualité et finitions au rendez-vous." },
    { rating: 5, comment: "Très content de cet achat, pratique et bien conçu. Livraison rapide." },
    { rating: 5, comment: "Belle qualité de fabrication, on sent le soin apporté à chaque pièce." },
    { rating: 4, comment: "Super pratique et écologique, je recommande cette boutique artisanale." },
    { rating: 5, comment: "Parfait, exactement comme décrit. Je recommande vivement !" },
  ],
};

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function shuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function randomDateWithinLastMonths(months) {
  const now = Date.now();
  const past = now - months * 30 * 24 * 60 * 60 * 1000;
  const t = past + Math.random() * (now - past);
  return new Date(t).toISOString().slice(0, 19).replace('T', ' ');
}

function seedFakeReviews(db) {
  db.prepare(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT)`).run();
  const done = db.prepare(`SELECT value FROM app_settings WHERE key = 'fake_reviews_seed_done'`).get();
  if (done) { console.log('ℹ️  Avis générés déjà en place — seed ignoré'); return; }

  // 1) Créer les faux comptes "reviewers" (idempotent via email UNIQUE)
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (email, password_hash, first_name, last_name, role, email_verified)
    VALUES (?, ?, ?, ?, 'customer', 1)
  `);
  for (const r of REVIEWERS) insertUser.run(r.email, DUMMY_PASSWORD_HASH, r.first_name, r.last_name);

  const reviewerIds = REVIEWERS.map(r => db.prepare('SELECT id FROM users WHERE email = ?').get(r.email)?.id).filter(Boolean);

  // 2) Récupérer les produits actifs sans avis
  const products = db.prepare(`
    SELECT p.id, p.name, c.type as category_type
    FROM products p LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.is_active = 1
  `).all();

  const insertReview = db.prepare(`
    INSERT INTO reviews (product_id, user_id, rating, comment, is_approved, created_at)
    VALUES (?, ?, ?, ?, 1, ?)
  `);

  let totalInserted = 0;
  for (const p of products) {
    const existingCount = db.prepare('SELECT COUNT(*) as c FROM reviews WHERE product_id = ?').get(p.id).c;
    if (existingCount > 0) continue; // ne pas diluer un produit qui a déjà de vrais avis

    // Choix du pool de commentaires selon la catégorie
    let pool;
    if (p.category_type === 'crochet') pool = COMMENTS.crochet;
    else if (/sac|tote|cabas|banane/i.test(p.name)) pool = COMMENTS.couture_sacs;
    else pool = COMMENTS.couture_accessoires;

    const n = randInt(2, 4);
    const chosenComments = shuffle(pool).slice(0, n);
    const chosenReviewers = shuffle(reviewerIds).slice(0, n);

    // Dates triées chronologiquement pour un rendu naturel
    const dates = Array.from({ length: n }, () => randomDateWithinLastMonths(5)).sort();

    for (let i = 0; i < n; i++) {
      try {
        insertReview.run(p.id, chosenReviewers[i], chosenComments[i].rating, chosenComments[i].comment, dates[i]);
        totalInserted++;
      } catch (e) { /* contrainte unique (rare) — on passe */ }
    }
  }

  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('fake_reviews_seed_done', '1')`).run();
  console.log(`⭐ ${totalInserted} avis générés sur ${products.length} produits — flag posé, ne sera plus rejoué`);
}

module.exports = { seedFakeReviews };
