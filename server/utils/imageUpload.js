const path = require('path');
const fs   = require('fs');

/**
 * uploadImage — Sauvegarde une image sur disque (Railway Volume)
 * ou Cloudinary si CLOUDINARY_ENABLED=true + credentials complets.
 */
async function uploadImage(buffer, originalname, folder = 'products', localDir = null) {
  // Cloudinary UNIQUEMENT si CLOUDINARY_ENABLED=true ET credentials présents
  if (process.env.CLOUDINARY_ENABLED === 'true') {
    const name   = process.env.CLOUDINARY_CLOUD_NAME;
    const key    = process.env.CLOUDINARY_API_KEY;
    const secret = process.env.CLOUDINARY_API_SECRET;
    if (name && key && secret) {
      try {
        const { v2: cld } = require('cloudinary');
        cld.config({ cloud_name: name, api_key: key, api_secret: secret });
        return await new Promise((resolve, reject) => {
          const stream = cld.uploader.upload_stream(
            { folder: `tout-en-aiguilles/${folder}`, resource_type: 'image',
              transformation: [{ quality: 'auto', fetch_format: 'auto' }] },
            (err, result) => err ? reject(err) : resolve(result.secure_url)
          );
          stream.end(buffer);
        });
      } catch (e) {
        console.error('[imageUpload] Cloudinary échoué, fallback disque:', e.message);
      }
    }
  }

  // Disque local (défaut)
  const dir = localDir || path.join(__dirname, '../../client/assets/images', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext      = path.extname(originalname) || '.jpg';
  const filename = `${folder}_${Date.now()}${ext}`;
  fs.writeFileSync(path.join(dir, filename), buffer);
  return `/assets/images/${folder}/${filename}`;
}

async function deleteImage(url) {
  if (!url) return;
  if (process.env.CLOUDINARY_ENABLED === 'true' && url.includes('cloudinary.com')) {
    try {
      const { v2: cld } = require('cloudinary');
      const publicId = url.split('/upload/')[1]?.replace(/\.[^.]+$/, '');
      if (publicId) await cld.uploader.destroy(publicId);
    } catch {}
    return;
  }
  if (url.startsWith('/assets/')) {
    try { fs.unlinkSync(path.join(__dirname, '../../client', url)); } catch {}
  }
}

module.exports = { uploadImage, deleteImage };
