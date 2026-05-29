/**
 * imageUpload.js — Gestion centralisée des uploads d'images
 * 
 * Si CLOUDINARY_URL est configuré → upload sur Cloudinary (persistant)
 * Sinon → stockage disque local (images perdues au redeploy Railway)
 */

const path = require('path');
const fs   = require('fs');

let cloudinary = null;

function getCloudinary() {
  if (cloudinary) return cloudinary;
  if (!process.env.CLOUDINARY_URL && !(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)) {
    return null;
  }
  try {
    const { v2 } = require('cloudinary');
    if (process.env.CLOUDINARY_URL) {
      v2.config({ cloudinary_url: process.env.CLOUDINARY_URL });
    } else {
      v2.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key:    process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
      });
    }
    cloudinary = v2;
    console.log('[imageUpload] Cloudinary configuré ✓');
  } catch (e) {
    console.warn('[imageUpload] Cloudinary non disponible:', e.message);
  }
  return cloudinary;
}

/**
 * Upload un buffer ou fichier vers Cloudinary ou disque local.
 * @param {Buffer} buffer      — contenu du fichier
 * @param {string} originalname — nom original pour l'extension
 * @param {string} folder       — sous-dossier Cloudinary (ex: 'products', 'reviews')
 * @param {string} localDir     — dossier disque absolu de fallback
 * @returns {Promise<string>}   — URL publique de l'image
 */
async function uploadImage(buffer, originalname, folder = 'products', localDir = null) {
  const cld = getCloudinary();

  if (cld) {
    // Upload vers Cloudinary
    return new Promise((resolve, reject) => {
      const ext = path.extname(originalname).toLowerCase();
      const upload = cld.uploader.upload_stream(
        {
          folder: `tout-en-aiguilles/${folder}`,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result.secure_url);
        }
      );
      upload.end(buffer);
    });
  }

  // Fallback : disque local
  const dir = localDir || path.join(__dirname, '../../client/assets/images', folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ext      = path.extname(originalname) || '.jpg';
  const filename = `${folder}_${Date.now()}${ext}`;
  const filepath = path.join(dir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/assets/images/${folder}/${filename}`;
}

/**
 * Supprime une image (Cloudinary ou disque).
 * @param {string} url — URL retournée par uploadImage
 */
async function deleteImage(url) {
  if (!url) return;
  const cld = getCloudinary();
  if (cld && url.includes('cloudinary.com')) {
    try {
      // Extraire le public_id depuis l'URL Cloudinary
      const match = url.match(/\/tout-en-aiguilles\/[^/]+\/([^/.]+)/);
      if (match) {
        const publicId = `tout-en-aiguilles/${url.split('/tout-en-aiguilles/')[1].replace(/\.[^.]+$/, '')}`;
        await cld.uploader.destroy(publicId);
      }
    } catch (e) { /* silent */ }
    return;
  }
  // Disque local
  if (url.startsWith('/assets/')) {
    const filepath = path.join(__dirname, '../../client', url);
    if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
  }
}

module.exports = { uploadImage, deleteImage, getCloudinary };
