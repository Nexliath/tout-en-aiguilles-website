/**
 * Promouvoir un utilisateur en administrateur
 * Usage : node scripts/make-admin.js email@exemple.fr
 */
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const email = process.argv[2];
if (!email) {
  console.error('Usage : node scripts/make-admin.js email@exemple.fr');
  process.exit(1);
}

const db = new DatabaseSync(path.join(__dirname, '../data/toutenaiguilles.db'));
const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

if (!user) {
  console.error(`❌ Utilisateur "${email}" introuvable. Créez d'abord un compte sur le site.`);
  process.exit(1);
}

db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(email);
db.close();
console.log(`✅ ${user.first_name} ${user.last_name} (${email}) est maintenant administrateur.`);
console.log(`   → Accédez à l'admin : http://localhost:3000/admin/`);
