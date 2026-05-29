// ─── Migration complète Etsy → Tout en Aiguilles ─────────────
// 19 listings Etsy → 22 produits (Dragon en 3 variantes couleur)
// + 7 avis migrés

function slugify(str) {
  return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')
    .replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

function seedEtsyProducts(db) {
  // ── Catégories ────────────────────────────────────────────────
  const cats = [
    { name: 'Doudous & Peluches', slug: 'doudous-peluches', type: 'crochet' },
    { name: 'Sacs & Tote Bags',   slug: 'sacs-tote-bags',   type: 'couture' },
    { name: 'Bébé & Naissance',   slug: 'bebe-naissance',   type: 'couture' },
  ];
  for (const c of cats) {
    const exists = db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.slug);
    if (!exists) {
      db.prepare('INSERT INTO categories (name, slug, type) VALUES (?, ?, ?)').run(c.name, c.slug, c.type);
    }
  }
  const getCatId = slug => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug)?.id;

  // ── Produits ─────────────────────────────────────────────────
  const products = [
    // ═══ PELUCHES CROCHET ══════════════════════════════════════
    {
      name: 'Doudou Singe Fuchsia',
      price: 20, stock: 1,
      category_slug: 'doudous-peluches',
      is_featured: 1,
      tags: '["peluche","crochet","singe","bébé","cadeau","personnalisable"]',
      images: ['https://i.etsystatic.com/59028429/r/il/9a5b6c/7525600659/il_794xN.7525600659_4b9e.jpg',
               'https://i.etsystatic.com/59028429/r/il/c0980b/7873883148/il_794xN.7873883148_3224.jpg'],
      description: `🐵 Clara le petit singe – la peluche qui adore faire des câlins

Clara est un adorable singe en crochet, toute douce et pleine de pep's avec sa belle couleur fuchsia 💕
Avec son museau et ses extrémités beige, elle apporte une touche de fun et de tendresse dans la chambre des enfants.

✨ Pourquoi elle plaît tant :
- Couleur vive qui apporte immédiatement de la joie dans une chambre d'enfant
- Fait main au crochet, chaque singe est une pièce unique 🧶
- Taille idéale pour un doudou ou une déco (environ 20–25 cm)
- Forme toute ronde et souple, parfaite pour les petits bras

🧶 Matériaux : Laine, rembourrage doux et moelleux

🎁 Idéal pour :
- Cadeau de naissance
- Cadeau d'anniversaire
- Déco de chambre bébé ou enfant
- Cadeau fait main unique pour les amoureux des singes et du crochet`,
    },
    {
      name: 'Doudou Girafe Jaune',
      price: 20, stock: 2,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","girafe","savane","bébé","cadeau"]',
      images: ['https://i.etsystatic.com/59028429/r/il/ce821a/7525487531/il_794xN.7525487531_8jrh.jpg',
               'https://i.etsystatic.com/59028429/r/il/25e81e/7525490241/il_794xN.7525490241_q0i1.jpg'],
      description: `🦒 Élise la girafe – rayonnante de bonne humeur

Avec son corps jaune lumineux et ses taches rouille, Élise la girafe est la star des chambres thème savane 🌞
Une peluche douce, originale et 100 % fait main.

✨ On aime :
- Son look chaleureux et joyeux
- Sa grande douceur au toucher
- Sa fabrication au crochet, pièce par pièce
- Sa taille idéale pour la déco et les câlins (environ 20–25 cm)

🧶 Matériaux : Laine, rembourrage moelleux

🎁 Une super idée pour :
- Cadeau de naissance
- Baby shower thème animaux
- Déco de chambre enfant`,
    },
    {
      name: 'Dragon au Crochet — Vert',
      price: 25, stock: 3,
      category_slug: 'doudous-peluches',
      is_featured: 1,
      tags: '["peluche","crochet","dragon","personnalisable","bébé","cadeau"]',
      variant_group_id: 'dragon-crochet',
      variant_label: 'Vert',
      images: ['https://i.etsystatic.com/59028429/r/il/29f72f/7477465152/il_794xN.7477465152_cdz8.jpg',
               'https://i.etsystatic.com/59028429/r/il/65f848/7525401087/il_794xN.7525401087_6bze.jpg'],
      description: `🐉 Gaspard le dragon – le gardien de la chambre

Gaspard est un adorable petit dragon vert, doux et moelleux, qui veille sur les nuits des enfants sans jamais cracher de feu 😄
Il apporte une touche de magie et de couleur dans la chambre, tout en étant un vrai compagnon de câlins.

✨ Pourquoi vous allez l'adorer :
- Fait main au crochet avec beaucoup de soin 🧶
- Ailes bleues et petites cornes blanches trop mignonnes
- Taille idéale pour les bras des enfants (environ 20–25 cm)
- Chaque dragon est unique : léger, moelleux et très photogénique

🧶 Matériaux : Laine, rembourrage doux et léger

🎁 Une super idée cadeau pour :
- Naissance ou baby shower
- Anniversaire
- Déco de chambre enfant originale et fait main`,
    },
    {
      name: 'Dragon au Crochet — Rouge',
      price: 25, stock: 2,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","dragon","personnalisable","bébé","cadeau"]',
      variant_group_id: 'dragon-crochet',
      variant_label: 'Rouge',
      images: ['https://i.etsystatic.com/59028429/r/il/8f7398/7477469006/il_794xN.7477469006_gmxj.jpg'],
      description: `🐉 Un dragon rouge vif, plein de caractère et de magie ! Fait main au crochet avec soin, ses ailes bleues et ses cornes blanches en font une peluche unique et attachante. Taille environ 20–25 cm. Laine et rembourrage doux.

🎁 Idéal pour : naissance, anniversaire, déco chambre enfant.`,
    },
    {
      name: 'Dragon au Crochet — Bleu',
      price: 25, stock: 2,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","dragon","personnalisable","bébé","cadeau"]',
      variant_group_id: 'dragon-crochet',
      variant_label: 'Bleu',
      images: ['https://i.etsystatic.com/59028429/r/il/e20b8c/7525403925/il_794xN.7525403925_ogi6.jpg'],
      description: `🐉 Un dragon bleu tout doux, parfait pour les petits aventuriers ! Fait main au crochet, avec son dos épineux et ses petites ailes, il est impossible de résister. Taille environ 20–25 cm. Laine et rembourrage doux.

🎁 Idéal pour : naissance, anniversaire, déco chambre enfant.`,
    },
    {
      name: 'Doudou Lion Crinière Rousse',
      price: 25, stock: 2,
      category_slug: 'doudous-peluches',
      is_featured: 1,
      tags: '["peluche","crochet","lion","savane","bébé","cadeau"]',
      images: ['https://i.etsystatic.com/59028429/r/il/5f4fad/7525534829/il_794xN.7525534829_m0d3.jpg',
               'https://i.etsystatic.com/59028429/r/il/866a06/7477602794/il_794xN.7477602794_d306.jpg'],
      description: `🦁 Raphaël le lion – le roi des câlins

Raphaël est un lion très doux, plus fan de câlins que de rugissements 😄
Sa crinière rousse et son corps jaune en font une peluche chaleureuse, parfaite pour une chambre thème savane.

✨ Ce qui fait la différence :
- Crinière crochetée à la main, pleine de texture
- Corps moelleux, facile à attraper et câliner
- Taille idéale pour les petits (environ 20–25 cm)
- Fait main, chaque lion est un peu unique

🧶 Matériaux : Laine, rembourrage doux

🎁 Parfait pour :
- Cadeau d'anniversaire ou de naissance
- Déco chambre thème jungle/savane
- Cadeau fait main pour petit·e aventurier·e`,
    },
    {
      name: 'Doudou Hippopotame Fuchsia',
      price: 20, stock: 3,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","hippopotame","bébé","cadeau","personnalisable"]',
      images: ['https://i.etsystatic.com/59028429/r/il/e834e8/7525450525/il_794xN.7525450525_tb90.jpg'],
      description: `🦛 Un adorable hippopotame au crochet, tout doux et plein de caractère ! Sa couleur fuchsia apporte de la gaieté dans la chambre des enfants. Fait main avec soin, chaque hippo est unique. Taille environ 20–25 cm. Laine et rembourrage doux. Couleurs personnalisables.

🎁 Idéal pour : cadeau de naissance, déco chambre bébé ou enfant.`,
    },
    {
      name: 'Doudou Éléphant Bleu',
      price: 20, stock: 2,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","éléphant","bébé","cadeau","naissance"]',
      images: ['https://i.etsystatic.com/59028429/r/il/bb3fda/7477578354/il_794xN.7477578354_n5aw.jpg'],
      description: `🐘 Eliot l'éléphant – avec ses grandes oreilles et sa belle couleur bleue, il est impossible de ne pas tomber sous son charme ! Une peluche au crochet douce et originale, parfaite pour accompagner les enfants. Environ 20–25 cm, laine et rembourrage doux. Personnalisable.

🎁 Idéal pour : cadeau de naissance, déco chambre thème jungle.`,
    },
    {
      name: 'Doudou Pingouin au Crochet',
      price: 20, stock: 1,
      category_slug: 'doudous-peluches',
      is_featured: 0,
      tags: '["peluche","crochet","pingouin","bébé","cadeau","hiver"]',
      images: ['https://i.etsystatic.com/59028429/r/il/5da016/7525555297/il_794xN.7525555297_f4c8.jpg'],
      description: `🐧 Ces adorables pingouins au crochet sont parfaits pour apporter de la fraîcheur dans la chambre des enfants ! Faits main avec soin, en laine douce et rembourrage moelleux. Environ 15–20 cm. Un cadeau original et attachant.

🎁 Idéal pour : cadeau d'anniversaire ou de naissance, déco chambre thème hiver.`,
    },
    // ═══ SACS & TOTE BAGS ══════════════════════════════════════
    {
      name: 'Tote Bag Velours Côtelé Plat',
      price: 25, stock: 5,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["tote bag","velours côtelé","sac","fait main","couture"]',
      images: ['https://i.etsystatic.com/59028429/r/il/96e094/7539611357/il_794xN.7539611357_q3p1.jpg'],
      description: `Un élégant sac tote bag plat en velours côtelé, doublé coton fleuri. Fait main avec soin pour accompagner votre quotidien avec style. Pratique, résistant et totalement unique.

✨ Caractéristiques :
- Velours côtelé doux au toucher
- Doublure coton fleuri assortie
- Anses solides pour une bonne prise en main
- Cousu à la main dans notre atelier`,
    },
    {
      name: 'Tote Bag Coton Motif',
      price: 15, stock: 4,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["tote bag","coton","motif","sac","fait main","marché"]',
      images: ['https://i.etsystatic.com/59028429/r/il/9378c2/7483659446/il_794xN.7483659446_pt5u.jpg'],
      description: `Un joli tote bag en coton motif, doublé vert, idéal comme sac de marché ou sac de ville. Léger, pratique et joliment cousu à la main. Un accessoire du quotidien qui allie style et praticité.`,
    },
    {
      name: 'Grand Cabas Velours Côtelé',
      price: 30, stock: 5,
      category_slug: 'sacs-tote-bags',
      is_featured: 1,
      tags: '["tote bag","velours côtelé","cabas","grand sac","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/f34057/7491700308/il_794xN.7491700308_jnr8.jpg'],
      description: `Un grand et beau cabas en velours côtelé, avec côtés pour plus de volume. Doublé coton fleuri, il est aussi pratique qu'élégant. Fait main avec amour pour accompagner vos courses, vos balades ou votre quotidien.

✨ Points forts :
- Velours côtelé de qualité, doux et résistant
- Avec côtés pour un volume généreux
- Doublure coton fleuri soigneusement cousue
- Anses renforcées`,
    },
    {
      name: 'Sac Banane Velours Côtelé (sur commande)',
      price: 30, stock: 10,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["sac banane","velours côtelé","bandoulière","personnalisable","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/bc54e8/7835421943/il_794xN.7835421943_68sc.jpg'],
      description: `Un sac banane en velours côtelé, fabriqué sur commande selon vos préférences de couleur et de motif. Doublé coton, fermeture zippée, bandoulière ajustable. Idéal pour garder l'essentiel à portée de main. Personnalisable : contactez-nous pour votre combinaison de couleurs.`,
    },
    {
      name: 'Tote Bag Velours Côtelé Personnalisé',
      price: 38, stock: 10,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["tote bag","velours côtelé","personnalisé","sur commande","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/1a250a/7787394996/il_794xN.7787394996_mru7.jpg'],
      description: `Un tote bag en velours côtelé entièrement personnalisable — avec ou sans côtés, selon votre préférence. Doublé coton, cousu à la main dans notre atelier. Choisissez votre couleur de velours et votre doublure pour un sac véritablement unique. Livraison offerte !`,
    },
    {
      name: 'Sac Bandoulière Enfant Licornes',
      price: 13, stock: 3,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["sac enfant","licornes","bandoulière","cadeau fille","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/3bccf0/7831856497/il_794xN.7831856497_yzwi.jpg'],
      description: `Un adorable sac bandoulière pour enfant avec un motif licornes, doté d'un rabat à pression. Fait main en tissu doux, il est parfait pour accompagner les petites aventurières au quotidien. Idéal comme cadeau pour une petite fille.`,
    },
    {
      name: 'Mini Sac Enfant Licornes',
      price: 13, stock: 4,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["mini sac","licornes","enfant","cadeau fille","fait main","rose"]',
      images: ['https://i.etsystatic.com/59028429/c/1080/1616/0/0/il/f16fcc/7783904236/il_794xN.7783904236_pi6a.jpg'],
      description: `Un petit sac en tissu rose avec un motif licornes, parfait pour les enfants. Léger et pratique, il peut servir de sac d'appoint ou de cadeau original pour une petite fille. Fait main avec soin dans notre atelier.`,
    },
    {
      name: 'Sac Banane Velours Côtelé',
      price: 25, stock: 4,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["sac banane","velours côtelé","bandoulière","zippé","fait main"]',
      images: ['https://i.etsystatic.com/59028429/c/1080/1080/0/474/il/7cd9ad/7783813944/il_794xN.7783813944_j9zi.jpg'],
      description: `Un élégant sac banane en velours côtelé, doublé coton fleuri. Fermeture zippée et bandoulière ajustable pour un port confortable. Parfait pour garder l'essentiel avec style lors de vos sorties.`,
    },
    {
      name: 'Tote Bag Fond Motif',
      price: 18, stock: 2,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["tote bag","motif","coton","sac plage","shopping","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/ce80e8/7483636804/il_794xN.7483636804_rujv.jpg'],
      description: `Un joli tote bag avec un fond à motif, doublé, fait main en coton. Idéal comme sac de plage ou sac shopping. Pratique et coloré pour accompagner vos journées estivales. Stock limité !`,
    },
    {
      name: 'Tote Bag Denim (Jean)',
      price: 18, stock: 2,
      category_slug: 'sacs-tote-bags',
      is_featured: 0,
      tags: '["tote bag","jean","denim","coton fleuri","quotidien","fait main"]',
      images: ['https://i.etsystatic.com/59028429/r/il/6d14e1/7531609365/il_794xN.7531609365_m80e.jpg'],
      description: `Un tote bag tendance en jean (denim), doublé coton fleuri. Robuste et stylé, il est parfait pour le quotidien. Un sac qui ne passe pas inaperçu, cousu à la main dans notre atelier. Stock limité !`,
    },
    // ═══ BÉBÉ & NAISSANCE ══════════════════════════════════════
    {
      name: 'Trousseau de Naissance Fait Main',
      price: 50, stock: 5,
      category_slug: 'bebe-naissance',
      is_featured: 1,
      tags: '["naissance","trousseau","cape de bain","lingettes","bavoir","bébé","cadeau","zéro déchet"]',
      images: [
        'https://i.etsystatic.com/59028429/r/il/34a733/6852865501/il_794xN.6852865501_r52k.jpg',
        'https://i.etsystatic.com/59028429/r/il/6134fe/6852864049/il_794xN.6852864049_kbnf.jpg',
        'https://i.etsystatic.com/59028429/r/il/87cf17/6852864467/il_794xN.6852864467_bvm7.jpg',
        'https://i.etsystatic.com/59028429/r/il/125a8f/6804859240/il_794xN.6804859240_ju5k.jpg',
        'https://i.etsystatic.com/59028429/r/il/99168c/6804860054/il_794xN.6804860054_96mg.jpg',
      ],
      description: `👶✨ Trousseau de naissance fait main – Cape de bain, lingettes lavables, bavoir et gant

Offrez un cadeau de naissance à la fois chaleureux, utile et responsable avec ce trousseau de naissance fait main, pensé pour allier douceur, praticité et écoresponsabilité.

🍼 Ce coffret contient :
- 1 cape de bain (100 x 100 cm) – Douce et absorbante, parfaite pour envelopper bébé après le bain
- 1 pochon réversible et ses 7 lingettes lavables (10 x 10 cm) – Pour débarbouiller en douceur
- 1 bavoir – Doublé et confortable pour accompagner les premiers repas
- 1 gant de toilette – Idéal pour la toilette quotidienne

🌿 Matériaux : coton, tissu éponge doux
🎨 Plusieurs motifs disponibles – contactez-nous pour voir les modèles du moment !
🧺 Lavable en machine

🎁 Parfait comme cadeau de naissance ou pour une baby shower`,
    },
    {
      name: 'Lot de 7 Lingettes Démaquillantes Lavables',
      price: 20, stock: 10,
      category_slug: 'bebe-naissance',
      is_featured: 0,
      tags: '["lingettes","démaquillantes","lavables","zéro déchet","pochon","fait main","écologie"]',
      images: ['https://i.etsystatic.com/59028429/r/il/efd56a/6849475888/il_794xN.6849475888_6bht.jpg'],
      description: `Un lot de 7 lingettes démaquillantes lavables livrées avec leur pochon de rangement. Zéro déchet, fait main, réutilisables — pour prendre soin de votre peau tout en respectant l'environnement 🌿

✨ Pourquoi les adopter :
- Douces et efficaces pour démaquiller
- Lavables en machine, très durables
- Pochon pour les ranger proprement
- Réduisent les déchets au quotidien

🎁 Idéal pour : cadeau écolo, cadeau de naissance, usage quotidien`,
    },
  ];

  // ── Insertion des produits ────────────────────────────────────
  let inserted = 0;
  for (const p of products) {
    const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
    if (exists) continue; // ne pas dupliquer

    const catId = getCatId(p.category_slug);
    const slug = slugify(p.name) + '-etsy-' + Date.now() + Math.random().toString(36).slice(2,5);
    try {
      db.prepare(`
        INSERT INTO products (name, slug, description, price, stock, category_id, images, tags,
          is_featured, is_active, variant_group_id, variant_label, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, datetime('now'))
      `).run(
        p.name, slug, p.description, p.price, p.stock, catId || null,
        JSON.stringify(p.images || []),
        p.tags || '[]',
        p.is_featured || 0,
        p.variant_group_id || null,
        p.variant_label || null
      );
      inserted++;
    } catch(e) { console.error(`Seed product error (${p.name}):`, e.message); }
  }
  if (inserted > 0) console.log(`🛍️  ${inserted} produit(s) Etsy importé(s)`);

  // ── Migration des avis Etsy ────────────────────────────────────
  seedEtsyReviews(db);
}

function seedEtsyReviews(db) {
  // Correspondances nom produit → avis
  const reviewsData = [
    {
      product_name: 'Tote Bag Fond Motif',
      author: 'Isabelle', rating: 5,
      comment: 'Bonjour le sac est une exellente qualité ;je suis trés contente de mon achat.',
      created_at: '2026-03-20',
    },
    {
      product_name: 'Grand Cabas Velours Côtelé',
      author: 'Sophie', rating: 5,
      comment: 'Superbe article qui correspond tout à fait à la description, de qualité et avec de superbes coloris. Je recommande vivement cette créatrice.',
      created_at: '2026-03-05',
    },
    {
      product_name: 'Grand Cabas Velours Côtelé',
      author: 'Lola', rating: 5,
      comment: 'Sac cabas vraiment très joli et très bien réalisé, conforme aux photos. On sent la qualité du fait-main. Merci à Victorine pour la remise en main propre ☺️',
      created_at: '2026-02-20',
    },
    {
      product_name: 'Tote Bag Denim (Jean)',
      author: 'Nelly', rating: 4,
      comment: 'joli sac, bien cousu et livré dans les délais',
      created_at: '2026-02-19',
    },
    {
      product_name: 'Grand Cabas Velours Côtelé',
      author: 'Beatrice', rating: 5,
      comment: 'Magnifique sac cabas, très bien réalisé. Proportions très pratiques car très solide. Je recommande vivement cette créatrice 👍🙂',
      created_at: '2026-02-14',
    },
    {
      product_name: 'Doudou Pingouin au Crochet',
      author: 'Victor', rating: 5,
      comment: 'Très belle peluche, de grande qualité ! Mon fils adore, merci !',
      created_at: '2026-01-11',
    },
    {
      product_name: 'Trousseau de Naissance Fait Main',
      author: 'Chloé', rating: 5,
      comment: 'Super article, magnifique cadeau de naissance. La douceur des produits est juste incroyable ! Je recommande les yeux fermés 🥰',
      created_at: '2025-05-17',
    },
  ];

  // Trouver un user_id admin fictif pour les avis migrés (user_id=1 ou premier user)
  const adminUser = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const reviewUserId = adminUser ? adminUser.id : 1;

  let reviewsInserted = 0;
  for (const r of reviewsData) {
    const product = db.prepare('SELECT id FROM products WHERE name = ?').get(r.product_name);
    if (!product) continue;

    // Vérifier si un avis identique existe déjà
    const existingReview = db.prepare(
      'SELECT id FROM reviews WHERE product_id = ? AND comment = ?'
    ).get(product.id, r.comment);
    if (existingReview) continue;

    try {
      // Insérer avec un user_id fictif différent pour chaque avis (évite la contrainte UNIQUE product_id+user_id)
      // On crée un enregistrement "guest" en utilisant un ID négatif via INSERT direct
      db.prepare(`
        INSERT INTO reviews (product_id, user_id, rating, comment, is_approved, created_at)
        VALUES (?, ?, ?, ?, 1, ?)
      `).run(product.id, -(reviewsInserted + 1), r.rating, r.comment, r.created_at + ' 10:00:00');
      reviewsInserted++;
    } catch(e) {
      // Si contrainte unique, essayer avec un autre user_id
      try {
        db.prepare(`
          INSERT OR IGNORE INTO reviews (product_id, user_id, rating, comment, is_approved, created_at)
          VALUES (?, ?, ?, ?, 1, ?)
        `).run(product.id, -(Date.now() + reviewsInserted), r.rating, r.comment, r.created_at + ' 10:00:00');
        reviewsInserted++;
      } catch(e2) {}
    }
  }
  if (reviewsInserted > 0) console.log(`⭐ ${reviewsInserted} avis Etsy migrés`);
}

module.exports = { seedEtsyProducts };
