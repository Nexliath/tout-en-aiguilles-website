const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { sendNewOrderNotification, sendOrderStatusEmail, sendReviewRequestEmail, sendRelayChangeEmail } = require('../utils/email');
const { logActivity } = require('../utils/activityLog');

// Anti-bruteforce : suivi de commande invité (numéro + email requis) —
// limite les tentatives d'énumération d'ID de commande.
const trackOrderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Migrations colonnes supplémentaires ─────────────────────
try { db.exec('ALTER TABLE orders ADD COLUMN review_requested_at TEXT'); } catch(e) {}
try { db.exec('ALTER TABLE orders ADD COLUMN tracking_number TEXT'); } catch(e) {}

const router = express.Router();

// ─── Migration : colonnes livraison (ajout silencieux si absentes) ─────────
for (const col of [
  "ALTER TABLE orders ADD COLUMN delivery_type TEXT DEFAULT 'home'",
  'ALTER TABLE orders ADD COLUMN delivery_fee REAL DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN relay_point TEXT',
]) {
  try { db.exec(col); } catch (e) { /* colonne déjà présente */ }
}

// ─── Résolution des lignes de commande (produit + variante) ──
// Un item panier peut porter un variant_id (couleur/motif choisi sur la
// fiche produit — voir product_variants). Avant, seul product_id/qty
// étaient pris en compte : le prix et le libellé de la variante étaient
// perdus entre le panier et la commande. Cette fonction centralise la
// résolution (prix, stock, libellé) pour les 3 chemins de paiement
// (Stripe, PayPal, mode démo) afin qu'ils restent cohérents.
function resolveOrderItems(items) {
  let productsTotal = 0;
  const resolved = [];
  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND is_active = 1').get(item.product_id);
    if (!product) throw new Error(`Produit ${item.product_id} introuvable`);

    let variant = null;
    if (item.variant_id) {
      variant = db.prepare('SELECT * FROM product_variants WHERE id = ? AND product_id = ? AND is_active = 1').get(item.variant_id, item.product_id);
      if (!variant) throw new Error(`Option choisie indisponible pour ${product.name}`);
    }

    const stock = variant ? variant.stock : product.stock;
    if (stock < item.qty) throw new Error(`Stock insuffisant pour ${product.name}${variant ? ' (' + variant.label + ')' : ''}`);

    const price = variant && variant.price != null ? variant.price : product.price;
    const images = variant && JSON.parse(variant.images || '[]').length > 0
      ? JSON.parse(variant.images || '[]')
      : JSON.parse(product.images || '[]');

    productsTotal += price * item.qty;
    resolved.push({
      product_id: item.product_id,
      name: product.name,
      price,
      qty: item.qty,
      image: images[0] || '',
      variant_id: variant ? variant.id : null,
      variant_label: variant ? variant.label : null,
    });
  }
  return { resolved, productsTotal };
}

// Décrémente le stock du produit ou, si l'article porte une variante,
// le stock de cette variante spécifiquement.
function decrementStockForItems(items) {
  for (const item of items) {
    if (item.variant_id) {
      db.prepare('UPDATE product_variants SET stock = stock - ? WHERE id = ?').run(item.qty, item.variant_id);
    } else {
      db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, item.product_id);
    }
  }
}

// Stripe — initialisé uniquement si la clé est disponible
let stripe = null;
if (process.env.STRIPE_SECRET_KEY) {
  stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
}

// ─── PayPal helpers ──────────────────────────────────────────
const PAYPAL_BASE = () => process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

async function getPayPalToken() {
  const cid = process.env.PAYPAL_CLIENT_ID;
  const sec = process.env.PAYPAL_CLIENT_SECRET;
  if (!cid || !sec) return null;
  const creds = Buffer.from(`${cid}:${sec}`).toString('base64');
  const r = await fetch(`${PAYPAL_BASE()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Authorization': `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  const d = await r.json();
  return d.access_token || null;
}

async function paypalRequest(method, path, body, token) {
  const r = await fetch(`${PAYPAL_BASE()}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: r.ok, status: r.status, data: await r.json() };
}

// POST /api/orders/checkout — créer une session Stripe Checkout
router.post('/checkout', async (req, res) => {
  const { items, customer, delivery, success_url, cancel_url } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Panier vide' });

  // Livraison
  const deliveryType  = delivery?.type  || 'home';
  const deliveryFee   = typeof delivery?.fee === 'number' ? delivery.fee : 0;
  const relayPoint    = delivery?.relay_point || null;

  // Valider les produits (+ variantes choisies) et calculer le total
  let orderItems, productsTotal;
  try {
    ({ resolved: orderItems, productsTotal } = resolveOrderItems(items));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const lineItems = orderItems.map(oi => ({
    price_data: {
      currency: 'eur',
      product_data: {
        name: oi.variant_label ? `${oi.name} — ${oi.variant_label}` : oi.name,
        images: oi.image ? [`${process.env.BASE_URL || 'http://localhost:3000'}${oi.image}`] : [],
      },
      unit_amount: Math.round(oi.price * 100),
    },
    quantity: oi.qty,
  }));

  // Ajouter les frais de livraison comme ligne Stripe (si > 0)
  if (deliveryFee > 0) {
    const deliveryLabel = deliveryType === 'home'
      ? 'Livraison à domicile (Mondial Relay)'
      : 'Livraison Point Relais (Mondial Relay)';
    lineItems.push({
      price_data: {
        currency: 'eur',
        product_data: { name: deliveryLabel },
        unit_amount: Math.round(deliveryFee * 100),
      },
      quantity: 1,
    });
  }

  const total = productsTotal + deliveryFee;

  // Créer la commande en base (status: pending)
  const orderData = JSON.stringify(orderItems);

  const orderResult = db.prepare(`
    INSERT INTO orders (user_id, email, first_name, last_name, address, city, postal_code, country, total, items, notes, delivery_type, delivery_fee, relay_point)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer.user_id || null,
    customer.email, customer.first_name, customer.last_name,
    customer.address, customer.city, customer.postal_code, customer.country || 'France',
    total, orderData, customer.notes || '',
    deliveryType, deliveryFee, relayPoint
  );

  const orderId = orderResult.lastInsertRowid;

  // Mode démo (sans Stripe)
  if (!stripe) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
    decrementStockForItems(orderItems);
    const demoOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (demoOrder) {
      sendNewOrderNotification({ ...demoOrder, items: JSON.parse(demoOrder.items || '[]') }).catch(console.error);
      sendOrderStatusEmail({ ...demoOrder, items: JSON.parse(demoOrder.items || '[]') }).catch(console.error);
    }
    return res.json({ demo: true, order_id: orderId, message: 'Commande enregistrée (mode démo)' });
  }

  // Avec Stripe : envoyer notification boutique dès la création (statut pending)
  const pendingOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (pendingOrder) {
    sendNewOrderNotification({ ...pendingOrder, items: JSON.parse(pendingOrder.items || '[]') }).catch(console.error);
  }

  // Session Stripe réelle
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      success_url: success_url || `${process.env.BASE_URL || 'http://localhost:3000'}/commande-confirmee.html?order=${orderId}`,
      cancel_url: cancel_url || `${process.env.BASE_URL || 'http://localhost:3000'}/panier.html`,
      customer_email: customer.email,
      metadata: { order_id: String(orderId) },
    });
    db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(session.id, orderId);
    res.json({ checkout_url: session.url, session_id: session.id, order_id: orderId });
  } catch (e) {
    res.status(500).json({ error: `Erreur Stripe : ${e.message}` });
  }
});

// POST /api/orders/webhook — Stripe webhook
router.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  if (!stripe || !process.env.STRIPE_WEBHOOK_SECRET) return res.json({ received: true });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).send(`Webhook Error: ${e.message}`);
  }
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.order_id;
    if (orderId) {
      db.prepare('UPDATE orders SET status = ?, stripe_payment_intent = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('paid', session.payment_intent, orderId);
      const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (order) {
        const parsedItems = JSON.parse(order.items || '[]');
        decrementStockForItems(parsedItems);
        // Email client : paiement confirmé + facture
        sendOrderStatusEmail({ ...order, items: parsedItems }).catch(console.error);
      }
    }
  }
  res.json({ received: true });
});

// GET /api/orders/my — mes commandes
router.get('/my', requireAuth, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id)
    .map(o => ({ ...o, items: JSON.parse(o.items || '[]') }));
  res.json(orders);
});

// GET /api/orders/track?order_id=X&email=Y — suivi de commande invité
// Aucun compte requis : le numéro de commande + l'email associé suffisent
// (comme sur la plupart des sites e-commerce). Ne renvoie que les infos
// utiles au suivi, pas les données de compte.
router.get('/track', trackOrderLimiter, (req, res) => {
  const { order_id, email } = req.query;
  if (!order_id || !email) return res.status(400).json({ error: 'Numéro de commande et email requis' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order || !order.email || order.email.toLowerCase() !== String(email).trim().toLowerCase()) {
    return res.status(404).json({ error: 'Aucune commande trouvée avec ce numéro et cet email' });
  }

  res.json({
    id: order.id,
    status: order.status,
    tracking_number: order.tracking_number || null,
    created_at: order.created_at,
    updated_at: order.updated_at,
    total: order.total,
    items: JSON.parse(order.items || '[]'),
    delivery_type: order.delivery_type,
    relay_point: order.relay_point || null,
    city: order.city || null,
    postal_code: order.postal_code || null,
  });
});

// GET /api/orders/:id — détail commande
router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (req.user.role !== 'admin' && order.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Accès refusé' });
  }
  res.json({ ...order, items: JSON.parse(order.items || '[]') });
});

// ─── Admin ──────────────────────────────────────────────────

// GET /api/orders — toutes les commandes (admin)
router.get('/', requireAdmin, (req, res) => {
  const { status } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];
  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  const orders = db.prepare(query).all(...params).map(o => ({ ...o, items: JSON.parse(o.items || '[]') }));
  res.json(orders);
});

// PUT /api/orders/:id/status — changer le statut (+ tracking_number optionnel)
router.put('/:id/status', requireAdmin, (req, res) => {
  const { status, tracking_number } = req.body;
  const valid = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Statut invalide' });
  if (tracking_number !== undefined) {
    db.prepare('UPDATE orders SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, tracking_number || null, req.params.id);
  } else {
    db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  }
  // Email client à chaque changement de statut
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (order && order.email) {
    sendOrderStatusEmail({ ...order, items: JSON.parse(order.items || '[]') }).catch(console.error);
  }
  logActivity(req.user, 'Statut commande modifié', `#${req.params.id} → ${status}`);
  res.json({ success: true });
});

// ─── PUT /api/orders/bulk/status — changement de statut groupé ─
router.put('/bulk/status', requireAdmin, (req, res) => {
  const { ids, status } = req.body;
  const valid = ['pending', 'paid', 'shipped', 'delivered', 'cancelled'];
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Aucune commande sélectionnée' });
  if (!valid.includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  const update = db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
  let updated = 0;
  for (const id of ids) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) continue;
    update.run(status, id);
    updated++;
    if (order.email) {
      sendOrderStatusEmail({ ...order, status, items: JSON.parse(order.items || '[]') }).catch(console.error);
    }
  }
  logActivity(req.user, 'Statut commandes modifié (groupé)', `${updated} commande(s) → ${status}`);
  res.json({ success: true, updated });
});

// PUT /api/orders/:id/relay-point — changer le point relais + notifier le client
router.put('/:id/relay-point', requireAdmin, async (req, res) => {
  const { relay_point } = req.body;
  if (!relay_point?.trim()) return res.status(400).json({ error: 'Nouveau point relais requis' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Commande introuvable' });
  if (order.delivery_type !== 'relay') return res.status(400).json({ error: 'Cette commande n\'est pas une livraison en point relais' });
  const oldRelay = order.relay_point;
  db.prepare('UPDATE orders SET relay_point = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(relay_point.trim(), req.params.id);
  try {
    await sendRelayChangeEmail({ ...order, items: JSON.parse(order.items || '[]') }, oldRelay, relay_point.trim());
    res.json({ success: true, notified: true });
  } catch(e) {
    console.error('Relay change email error:', e.message);
    res.json({ success: true, notified: false, error: e.message });
  }
});

// ─── PayPal : config publique (client_id) ──────────────────────
router.get('/paypal/config', (req, res) => {
  const cid = process.env.PAYPAL_CLIENT_ID;
  if (!cid) return res.json({ enabled: false });
  res.json({ enabled: true, client_id: cid, mode: process.env.PAYPAL_MODE || 'sandbox' });
});

// ─── PayPal : créer une commande ───────────────────────────────
router.post('/paypal/create', async (req, res) => {
  const { items, customer, delivery } = req.body;
  if (!items || items.length === 0) return res.status(400).json({ error: 'Panier vide' });

  const deliveryType = delivery?.type || 'home';
  const deliveryFee  = typeof delivery?.fee === 'number' ? delivery.fee : 0;
  const relayPoint   = delivery?.relay_point || null;

  // Valider les produits (+ variantes choisies)
  let orderItems, productsTotal;
  try {
    ({ resolved: orderItems, productsTotal } = resolveOrderItems(items));
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const total = productsTotal + deliveryFee;

  // Créer la commande en base
  const orderData = JSON.stringify(orderItems);
  const result = db.prepare(`
    INSERT INTO orders (user_id, email, first_name, last_name, address, city, postal_code, country, total, items, notes, delivery_type, delivery_fee, relay_point)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer.user_id || null, customer.email, customer.first_name, customer.last_name,
    customer.address, customer.city, customer.postal_code, customer.country || 'France',
    total, orderData, customer.notes || '', deliveryType, deliveryFee, relayPoint
  );
  const orderId = result.lastInsertRowid;

  // Notification boutique immédiate
  const newOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  sendNewOrderNotification({ ...newOrder, items: orderItems }).catch(console.error);

  // Créer l'ordre PayPal
  const token = await getPayPalToken();
  if (!token) {
    // Mode démo sans PayPal
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
    decrementStockForItems(orderItems);
    return res.json({ demo: true, order_id: orderId });
  }

  const { ok, data: ppOrder } = await paypalRequest('POST', '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: String(orderId),
      amount: { currency_code: 'EUR', value: total.toFixed(2) },
      description: `Commande Tout en Aiguilles #${orderId}`,
    }],
  }, token);

  if (!ok) return res.status(500).json({ error: `PayPal : ${ppOrder.message || 'erreur inconnue'}` });

  db.prepare('UPDATE orders SET stripe_session_id = ? WHERE id = ?').run(`paypal:${ppOrder.id}`, orderId);
  res.json({ paypal_order_id: ppOrder.id, order_id: orderId });
});

// ─── PayPal : capturer le paiement ─────────────────────────────
router.post('/paypal/capture', async (req, res) => {
  const { paypal_order_id, order_id } = req.body;
  if (!paypal_order_id || !order_id) return res.status(400).json({ error: 'Données manquantes' });

  const token = await getPayPalToken();
  if (!token) return res.status(500).json({ error: 'PayPal non configuré' });

  const { ok, data: capture } = await paypalRequest('POST', `/v2/checkout/orders/${paypal_order_id}/capture`, {}, token);
  if (!ok || capture.status !== 'COMPLETED') {
    return res.status(400).json({ error: `Paiement non complété : ${capture.status || 'erreur'}` });
  }

  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run('paid', order_id);
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (order) {
    const parsedItems = JSON.parse(order.items || '[]');
    decrementStockForItems(parsedItems);
    sendOrderStatusEmail({ ...order, items: parsedItems }).catch(console.error);
  }
  res.json({ success: true, order_id });
});

// ─── GET /api/orders/review-reminders — envoi des demandes d'avis J+8 ──
// Protégé par CRON_SECRET (header x-cron-secret ou query ?secret=)
// Appelé chaque jour à 10h par le scheduled task Cowork
router.get('/review-reminders', async (req, res) => {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] || req.query.secret;
  if (secret && provided !== secret) {
    return res.status(401).json({ error: 'Non autorisé' });
  }

  const eligible = db.prepare(`
    SELECT * FROM orders
    WHERE status = 'delivered'
    AND review_requested_at IS NULL
    AND updated_at <= datetime('now', '-7 days')
  `).all();

  let sent = 0, errors = 0;
  for (const order of eligible) {
    try {
      await sendReviewRequestEmail({ ...order, items: JSON.parse(order.items || '[]') });
      db.prepare('UPDATE orders SET review_requested_at = CURRENT_TIMESTAMP WHERE id = ?').run(order.id);
      sent++;
    } catch (e) {
      console.error(`Review reminder error order #${order.id}:`, e.message);
      errors++;
    }
  }
  console.log(`📧 Review reminders: ${sent} envoyé(s), ${errors} erreur(s), ${eligible.length - sent - errors} ignoré(s)`);
  res.json({ processed: eligible.length, sent, errors });
});

module.exports = router;
