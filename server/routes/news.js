const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { logActivity } = require('../utils/activityLog');
const { processAndSaveImage } = require('../utils/imageProcess');
const { asyncRoute } = require('../middleware/asyncRoute');

const router = express.Router();

// Config upload images d'articles — en mémoire : redimensionnées et
// compressées (sharp) avant écriture sur disque, voir saveNewsImage().
const NEWS_IMG_DIR = path.join(__dirname, '../../client/assets/images/news');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
async function saveNewsImage(file) {
  const name = await processAndSaveImage(file.buffer, NEWS_IMG_DIR, `news_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  return `/assets/images/news/${name}`;
}

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Un article est visible publiquement s'il est publié ET (pas de date de
// publication programmée, ou cette date est déjà passée).
const PUBLIC_WHERE = "published = 1 AND (publish_at IS NULL OR publish_at = '' OR datetime(publish_at) <= datetime('now'))";

function attachRelatedProducts(article) {
  const rows = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug,
      ROUND(AVG(CASE WHEN r.is_approved = 1 THEN r.rating END), 1) as avg_rating,
      COUNT(CASE WHEN r.is_approved = 1 THEN r.id END) as review_count
    FROM news_products np
    JOIN products p ON p.id = np.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    LEFT JOIN reviews r ON r.product_id = p.id
    WHERE np.news_id = ?
    GROUP BY p.id
    ORDER BY np.sort_order ASC
  `).all(article.id);
  article.related_products = rows.map(p => ({
    ...p,
    images: (() => { try { return JSON.parse(p.images || '[]'); } catch { return []; } })(),
    tags: (() => { try { return JSON.parse(p.tags || '[]'); } catch { return []; } })()
  }));
  return article;
}

// GET /api/news — liste des articles publiés (?limit=&offset=&category=&search=&featured=1)
router.get('/', (req, res) => {
  const { limit = 10, offset = 0, category, search, featured } = req.query;
  const where = [PUBLIC_WHERE];
  const params = [];
  if (category) { where.push('category = ?'); params.push(category); }
  if (search) { where.push('(title LIKE ? OR excerpt LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (featured === '1' || featured === 'true') { where.push('is_featured = 1'); }
  params.push(Number(limit), Number(offset));
  const articles = db.prepare(
    `SELECT * FROM news WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params);
  res.json(articles);
});

// GET /api/news/categories — liste des catégories utilisées (articles publiés)
router.get('/categories', (req, res) => {
  const rows = db.prepare(`
    SELECT category, COUNT(*) as count FROM news
    WHERE ${PUBLIC_WHERE} AND category IS NOT NULL AND category != ''
    GROUP BY category ORDER BY category ASC
  `).all();
  res.json(rows);
});

// ─── Admin ─── déclarée AVANT /:slug pour ne pas être masquée ─

// GET /api/news/admin/all
router.get('/admin/all', requireAdmin, (req, res) => {
  const articles = db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
  res.json(articles);
});

// GET /api/news/admin/:id — un article (brouillon inclus) avec ses produits associés
router.get('/admin/:id', requireAdmin, (req, res) => {
  const article = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!article) return res.status(404).json({ error: 'Article introuvable' });
  attachRelatedProducts(article);
  res.json(article);
});

// GET /api/news/:slug — article par slug
router.get('/:slug', (req, res) => {
  const article = db.prepare(`SELECT * FROM news WHERE slug = ? AND ${PUBLIC_WHERE}`).get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Article introuvable' });
  db.prepare('UPDATE news SET views = views + 1 WHERE id = ?').run(article.id);
  article.views = (article.views || 0) + 1;

  attachRelatedProducts(article);

  // Articles liés : même catégorie, publiés, hors article courant
  let relatedArticles = [];
  if (article.category) {
    relatedArticles = db.prepare(`
      SELECT id, title, slug, excerpt, cover_image, created_at FROM news
      WHERE ${PUBLIC_WHERE} AND category = ? AND id != ?
      ORDER BY created_at DESC LIMIT 3
    `).all(article.category, article.id);
  }
  if (relatedArticles.length < 3) {
    const exclude = [article.id, ...relatedArticles.map(a => a.id)];
    const placeholders = exclude.map(() => '?').join(',');
    const more = db.prepare(`
      SELECT id, title, slug, excerpt, cover_image, created_at FROM news
      WHERE ${PUBLIC_WHERE} AND id NOT IN (${placeholders})
      ORDER BY created_at DESC LIMIT ?
    `).all(...exclude, 3 - relatedArticles.length);
    relatedArticles = relatedArticles.concat(more);
  }
  article.related_articles = relatedArticles;

  res.json(article);
});

// POST /api/news/upload-image — upload d'une image à insérer dans le corps d'un article (admin)
router.post('/upload-image', requireAdmin, upload.single('image'), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image requise' });
  res.json({ url: await saveNewsImage(req.file) });
}));

// Synchronise la table news_products à partir d'un tableau d'IDs produits (ordre conservé)
function syncRelatedProducts(newsId, rawIds) {
  let ids = [];
  try {
    const parsed = typeof rawIds === 'string' ? JSON.parse(rawIds) : rawIds;
    if (Array.isArray(parsed)) ids = parsed.map(Number).filter(n => Number.isInteger(n) && n > 0);
  } catch { /* ignore, ids reste vide */ }

  db.prepare('DELETE FROM news_products WHERE news_id = ?').run(newsId);
  if (!ids.length) return;
  const insert = db.prepare('INSERT OR IGNORE INTO news_products (news_id, product_id, sort_order) VALUES (?, ?, ?)');
  ids.forEach((pid, i) => insert.run(newsId, pid, i));
}

// Vérifie l'unicité d'un slug (hors un éventuel id à exclure)
function slugTaken(slug, excludeId) {
  const row = excludeId
    ? db.prepare('SELECT id FROM news WHERE slug = ? AND id != ?').get(slug, excludeId)
    : db.prepare('SELECT id FROM news WHERE slug = ?').get(slug);
  return !!row;
}

// POST /api/news — créer un article
router.post('/', requireAdmin, upload.single('cover_image'), asyncRoute(async (req, res) => {
  const { title, excerpt, content, published, meta_title, meta_description,
          category, is_featured, publish_at, related_products } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis' });

  let slug = (req.body.slug || '').trim() ? slugify(req.body.slug) : slugify(title);
  if (!slug || slugTaken(slug)) slug = slugify(title) + '-' + Date.now();

  const cover = req.file ? await saveNewsImage(req.file) : null;
  const featured = is_featured === 'true' || is_featured === '1' ? 1 : 0;

  const result = db.prepare(`
    INSERT INTO news (title, slug, excerpt, content, cover_image, published, meta_title, meta_description, category, is_featured, publish_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, slug, excerpt || '', content, cover, published === 'true' || published === '1' ? 1 : 0,
         meta_title?.trim() || null, meta_description?.trim() || null,
         category?.trim() || null, featured, publish_at?.trim() || null);

  const newsId = result.lastInsertRowid;
  if (featured) db.prepare('UPDATE news SET is_featured = 0 WHERE id != ?').run(newsId);
  if (related_products !== undefined) syncRelatedProducts(newsId, related_products);

  logActivity(req.user, 'Article créé', title);
  res.status(201).json({ success: true, id: newsId, slug });
}));

// PUT /api/news/:id — modifier un article
router.put('/:id', requireAdmin, upload.single('cover_image'), asyncRoute(async (req, res) => {
  const { title, excerpt, content, published, meta_title, meta_description,
          category, is_featured, publish_at, related_products } = req.body;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Article introuvable' });

  let slug = existing.slug;
  if (req.body.slug !== undefined && req.body.slug.trim()) {
    const candidate = slugify(req.body.slug);
    if (candidate && candidate !== existing.slug) {
      if (slugTaken(candidate, existing.id)) {
        return res.status(400).json({ error: 'Ce slug est déjà utilisé par un autre article.' });
      }
      slug = candidate;
    }
  }

  const cover = req.file ? await saveNewsImage(req.file) : existing.cover_image;
  const featured = is_featured !== undefined ? (is_featured === 'true' || is_featured === '1' ? 1 : 0) : existing.is_featured;

  db.prepare(`
    UPDATE news SET title=?, slug=?, excerpt=?, content=?, cover_image=?, published=?, meta_title=?, meta_description=?,
      category=?, is_featured=?, publish_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(title || existing.title, slug, excerpt ?? existing.excerpt, content || existing.content,
         cover, published !== undefined ? (published === 'true' || published === '1' ? 1 : 0) : existing.published,
         meta_title !== undefined ? (meta_title?.trim() || null) : existing.meta_title,
         meta_description !== undefined ? (meta_description?.trim() || null) : existing.meta_description,
         category !== undefined ? (category?.trim() || null) : existing.category,
         featured,
         publish_at !== undefined ? (publish_at?.trim() || null) : existing.publish_at,
         req.params.id);

  if (featured) db.prepare('UPDATE news SET is_featured = 0 WHERE id != ?').run(req.params.id);
  if (related_products !== undefined) syncRelatedProducts(Number(req.params.id), related_products);

  logActivity(req.user, 'Article modifié', title || existing.title);
  res.json({ success: true, slug });
}));

// DELETE /api/news/:id — supprimer un article
router.delete('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT title FROM news WHERE id = ?').get(req.params.id);
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  logActivity(req.user, 'Article supprimé', existing?.title || `#${req.params.id}`);
  res.json({ success: true });
});

module.exports = router;
