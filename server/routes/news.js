const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Config upload images d'articles
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../client/assets/images/news');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `news_${Date.now()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

function slugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// GET /api/news — liste des articles publiés
router.get('/', (req, res) => {
  const { limit = 10, offset = 0 } = req.query;
  const articles = db.prepare('SELECT * FROM news WHERE published = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(Number(limit), Number(offset));
  res.json(articles);
});

// ─── Admin ─── déclarée AVANT /:slug pour ne pas être masquée ─

// GET /api/news/admin/all
router.get('/admin/all', requireAdmin, (req, res) => {
  const articles = db.prepare('SELECT * FROM news ORDER BY created_at DESC').all();
  res.json(articles);
});

// GET /api/news/:slug — article par slug
router.get('/:slug', (req, res) => {
  const article = db.prepare('SELECT * FROM news WHERE slug = ? AND published = 1').get(req.params.slug);
  if (!article) return res.status(404).json({ error: 'Article introuvable' });
  res.json(article);
});

// POST /api/news/upload-image — upload d'une image à insérer dans le corps d'un article (admin)
router.post('/upload-image', requireAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image requise' });
  res.json({ url: `/assets/images/news/${req.file.filename}` });
});

// POST /api/news — créer un article
router.post('/', requireAdmin, upload.single('cover_image'), (req, res) => {
  const { title, excerpt, content, published } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis' });
  const slug = slugify(title) + '-' + Date.now();
  const cover = req.file ? `/assets/images/news/${req.file.filename}` : null;
  db.prepare('INSERT INTO news (title, slug, excerpt, content, cover_image, published) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, slug, excerpt || '', content, cover, published === 'true' || published === '1' ? 1 : 0);
  res.status(201).json({ success: true });
});

// PUT /api/news/:id — modifier un article
router.put('/:id', requireAdmin, upload.single('cover_image'), (req, res) => {
  const { title, excerpt, content, published } = req.body;
  const existing = db.prepare('SELECT * FROM news WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Article introuvable' });
  const cover = req.file ? `/assets/images/news/${req.file.filename}` : existing.cover_image;
  db.prepare(`
    UPDATE news SET title=?, excerpt=?, content=?, cover_image=?, published=?, updated_at=CURRENT_TIMESTAMP WHERE id=?
  `).run(title || existing.title, excerpt ?? existing.excerpt, content || existing.content,
         cover, published !== undefined ? (published === 'true' || published === '1' ? 1 : 0) : existing.published,
         req.params.id);
  res.json({ success: true });
});

// DELETE /api/news/:id — supprimer un article
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM news WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

module.exports = router;
