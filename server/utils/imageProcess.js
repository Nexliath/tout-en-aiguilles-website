const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Redimensionne et compresse une image uploadée (depuis un buffer multer en
// mémoire) puis l'écrit sur disque en JPEG. Évite que des photos de 3-4000px
// / plusieurs Mo (courant avec les photos de téléphone) ralentissent le site
// — l'image affichée est déjà plafonnée en hauteur côté CSS, mais sans ce
// traitement le visiteur téléchargeait quand même le fichier complet.
//
// @param {Buffer} buffer      contenu du fichier uploadé (req.file.buffer)
// @param {string} destDir     dossier de destination absolu (créé si besoin)
// @param {string} filenameBase nom de fichier sans extension
// @param {object} [opts]      { maxWidth, maxHeight, quality }
// @returns {Promise<string>}  nom de fichier final écrit (avec extension .jpg)
async function processAndSaveImage(buffer, destDir, filenameBase, opts = {}) {
  const { maxWidth = 1600, maxHeight = 1600, quality = 82 } = opts;
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  const finalName = `${filenameBase}.jpg`;
  const outPath = path.join(destDir, finalName);
  await sharp(buffer)
    .rotate() // respecte l'orientation EXIF (photos prises au téléphone)
    .resize({ width: maxWidth, height: maxHeight, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outPath);
  return finalName;
}

module.exports = { processAndSaveImage };
