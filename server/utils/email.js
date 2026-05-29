// ─── Service d'envoi d'emails via Brevo API (HTTP) ───────────
// Utilise l'API REST Brevo au lieu du SMTP pour éviter les blocages
// de ports sur les hébergeurs cloud (Railway, Render, etc.)

async function sendVerificationEmail(toEmail, firstName, token, baseUrl) {
  const verifyUrl = `${baseUrl}/verify-email.html?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#c8937a,#e8b89a);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🧶</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:1px;">Tout en Aiguilles</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#5a3e2b;font-size:20px;">Bonjour ${firstName} 👋</h2>
            <p style="color:#6b5547;line-height:1.7;margin:0 0 24px;">
              Merci de vous être inscrit(e) sur <strong>Tout en Aiguilles</strong> !<br>
              Pour activer votre compte, cliquez sur le bouton ci-dessous.
            </p>
            <div style="text-align:center;margin:32px 0;">
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#c8937a;color:#fff;text-decoration:none;
                        padding:14px 36px;border-radius:8px;font-size:16px;font-family:Georgia,serif;">
                ✅ Confirmer mon adresse email
              </a>
            </div>
            <p style="color:#9e8070;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Ce lien est valable pendant <strong>24 heures</strong>.<br>
              Si vous n'avez pas créé de compte, ignorez cet email.
            </p>
            <hr style="border:none;border-top:1px solid #f0e8e0;margin:28px 0;">
            <p style="color:#b8a090;font-size:12px;margin:0;">
              Lien de secours :<br>
              <a href="${verifyUrl}" style="color:#c8937a;word-break:break-all;">${verifyUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf8f5;padding:20px 40px;text-align:center;">
            <p style="color:#b8a090;font-size:12px;margin:0;">© 2026 Tout en Aiguilles — L'art du fil, à chaque maille.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // ── Mode démo : pas de clé API → log dans la console ────────
  if (!process.env.BREVO_API_KEY) {
    console.log('\n📧 [MODE DÉMO — EMAIL NON ENVOYÉ]');
    console.log(`   Destinataire : ${toEmail}`);
    console.log(`   Lien de vérification : ${verifyUrl}\n`);
    return { demo: true };
  }

  // ── Envoi via Brevo API (HTTPS port 443 — jamais bloqué) ────
  const senderEmail = process.env.SMTP_FROM
    ? process.env.SMTP_FROM.match(/<(.+)>/)?.[1] || process.env.SMTP_FROM
    : process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles', email: senderEmail },
      to: [{ email: toEmail, name: firstName }],
      subject: '✅ Confirmez votre adresse email — Tout en Aiguilles',
      htmlContent: html,
      textContent: `Bonjour ${firstName},\n\nMerci de vous être inscrit(e) sur Tout en Aiguilles !\n\nConfirmez votre email :\n${verifyUrl}\n\nCe lien est valable 24 heures.\n\n— Tout en Aiguilles`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${err}`);
  }

  return { sent: true };
}

// ─── Email de confirmation de changement d'adresse ──────────
async function sendEmailChangeConfirmation(toEmail, firstName, token, baseUrl) {
  const confirmUrl = `${baseUrl}/api/auth/confirm-email-change?token=${token}`;

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#c8937a,#e8b89a);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🧶</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:1px;">Tout en Aiguilles</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#5a3e2b;font-size:20px;">Bonjour ${firstName} 👋</h2>
            <p style="color:#6b5547;line-height:1.7;margin:0 0 16px;">
              Vous avez demandé à changer votre adresse email sur <strong>Tout en Aiguilles</strong>.<br>
              Cliquez sur le bouton ci-dessous pour confirmer que <strong>${toEmail}</strong> est bien votre nouvelle adresse.
            </p>
            <div style="background:#fdf8f5;border-radius:8px;padding:12px 16px;margin:0 0 24px;font-size:14px;color:#9e8070;">
              ⚠️ Si vous n'avez pas fait cette demande, ignorez cet email — votre adresse actuelle restera inchangée.
            </div>
            <div style="text-align:center;margin:32px 0;">
              <a href="${confirmUrl}"
                 style="display:inline-block;background:#c8937a;color:#fff;text-decoration:none;
                        padding:14px 36px;border-radius:8px;font-size:16px;font-family:Georgia,serif;">
                ✅ Confirmer ma nouvelle adresse
              </a>
            </div>
            <p style="color:#9e8070;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Ce lien est valable pendant <strong>24 heures</strong>.
            </p>
            <hr style="border:none;border-top:1px solid #f0e8e0;margin:28px 0;">
            <p style="color:#b8a090;font-size:12px;margin:0;">
              Lien de secours :<br>
              <a href="${confirmUrl}" style="color:#c8937a;word-break:break-all;">${confirmUrl}</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf8f5;padding:20px 40px;text-align:center;">
            <p style="color:#b8a090;font-size:12px;margin:0;">© 2026 Tout en Aiguilles — L'art du fil, à chaque maille.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!process.env.BREVO_API_KEY) {
    console.log('\n📧 [MODE DÉMO — EMAIL NON ENVOYÉ]');
    console.log(`   Destinataire : ${toEmail}`);
    console.log(`   Lien de confirmation email : ${confirmUrl}\n`);
    return { demo: true };
  }

  const senderEmail = process.env.SMTP_FROM
    ? process.env.SMTP_FROM.match(/<(.+)>/)?.[1] || process.env.SMTP_FROM
    : process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles', email: senderEmail },
      to: [{ email: toEmail, name: firstName }],
      subject: '🔒 Confirmez votre nouvelle adresse email — Tout en Aiguilles',
      htmlContent: html,
      textContent: `Bonjour ${firstName},\n\nConfirmez votre nouvelle adresse email :\n${confirmUrl}\n\nCe lien expire dans 24 heures.\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\n— Tout en Aiguilles`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${err}`);
  }
  return { sent: true };
}

// ─── Email de contact (formulaire → tout.en.aiguilles@gmail.com) ──
async function sendContactEmail(visitorName, visitorEmail, message) {
  const CONTACT_DEST = process.env.CONTACT_EMAIL || 'tout.en.aiguilles@gmail.com';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        <tr>
          <td style="background:linear-gradient(135deg,#c8937a,#e8b89a);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">💌</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:1px;">Nouveau message reçu</h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #f0e8e0;">
                  <span style="color:#9e8070;font-size:13px;">De</span><br>
                  <strong style="color:#5a3e2b;">${visitorName}</strong>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid #f0e8e0;">
                  <span style="color:#9e8070;font-size:13px;">Email</span><br>
                  <a href="mailto:${visitorEmail}" style="color:#c8937a;">${visitorEmail}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:16px 0;">
                  <span style="color:#9e8070;font-size:13px;">Message</span><br>
                  <p style="color:#5a3e2b;line-height:1.7;margin:8px 0 0;white-space:pre-wrap;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
                </td>
              </tr>
            </table>
            <div style="margin-top:24px;text-align:center;">
              <a href="mailto:${visitorEmail}?subject=Re: votre message sur Tout en Aiguilles"
                 style="display:inline-block;background:#c8937a;color:#fff;text-decoration:none;
                        padding:12px 28px;border-radius:8px;font-size:15px;font-family:Georgia,serif;">
                ✉️ Répondre à ${visitorName}
              </a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="background:#fdf8f5;padding:20px 40px;text-align:center;">
            <p style="color:#b8a090;font-size:12px;margin:0;">© 2026 Tout en Aiguilles — L'art du fil, à chaque maille.</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  if (!process.env.BREVO_API_KEY) {
    console.log('\n📧 [MODE DÉMO — CONTACT NON ENVOYÉ]');
    console.log(`   De : ${visitorName} <${visitorEmail}>`);
    console.log(`   Message : ${message}\n`);
    return { demo: true };
  }

  const senderEmail = process.env.SMTP_FROM
    ? process.env.SMTP_FROM.match(/<(.+)>/)?.[1] || process.env.SMTP_FROM
    : process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles — Formulaire', email: senderEmail },
      to: [{ email: CONTACT_DEST, name: 'Tout en Aiguilles' }],
      replyTo: { email: visitorEmail, name: visitorName },
      subject: `💌 Message de ${visitorName} — Tout en Aiguilles`,
      htmlContent: html,
      textContent: `Nouveau message de ${visitorName} (${visitorEmail}) :\n\n${message}`,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Brevo API error ${response.status}: ${err}`);
  }
  return { sent: true };
}

// ─── Helpers internes ───────────────────────────────────────────
function formatDate(d) {
  return new Date(d || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function statusLabel(s) {
  return { pending: '⏳ En attente de paiement', paid: '✅ Paiement reçu', shipped: '📦 Expédiée', delivered: '🎉 Livrée', cancelled: '❌ Annulée' }[s] || s;
}
function invoiceRows(items) {
  return (items || []).map(i => `
    <tr>
      <td style="padding:10px 12px;color:#5a3e2b;border-bottom:1px solid #f0e8e0;">${i.name}</td>
      <td style="padding:10px 12px;text-align:center;color:#6b5547;border-bottom:1px solid #f0e8e0;">${i.qty}</td>
      <td style="padding:10px 12px;text-align:right;color:#5a3e2b;border-bottom:1px solid #f0e8e0;">${Number(i.price).toFixed(2)} €</td>
      <td style="padding:10px 12px;text-align:right;font-weight:700;color:#c0718a;border-bottom:1px solid #f0e8e0;">${(i.price * i.qty).toFixed(2)} €</td>
    </tr>`).join('');
}
function invoiceBlock(order) {
  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);
  const deliveryFee = Number(order.delivery_fee || 0);
  return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #f0e8e0;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#fdf8f5;">
          <th style="padding:10px 12px;text-align:left;color:#9e8070;font-size:12px;font-weight:normal;">Article</th>
          <th style="padding:10px 12px;text-align:center;color:#9e8070;font-size:12px;font-weight:normal;">Qté</th>
          <th style="padding:10px 12px;text-align:right;color:#9e8070;font-size:12px;font-weight:normal;">Prix unit.</th>
          <th style="padding:10px 12px;text-align:right;color:#9e8070;font-size:12px;font-weight:normal;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${invoiceRows(items)}
        ${deliveryFee > 0 ? `<tr><td colspan="3" style="padding:10px 12px;color:#6b5547;border-bottom:1px solid #f0e8e0;">Livraison</td><td style="padding:10px 12px;text-align:right;color:#5a3e2b;border-bottom:1px solid #f0e8e0;">${deliveryFee.toFixed(2)} €</td></tr>` : ''}
      </tbody>
      <tfoot>
        <tr style="background:#fdf8f5;">
          <td colspan="3" style="padding:12px;font-weight:700;color:#5a3e2b;">Total</td>
          <td style="padding:12px;text-align:right;font-weight:700;font-size:16px;color:#c0718a;">${Number(order.total).toFixed(2)} €</td>
        </tr>
      </tfoot>
    </table>`;
}
function emailHeader(emoji, title) {
  return `
    <tr>
      <td style="background:linear-gradient(135deg,#c8937a,#e8b89a);padding:36px 40px;text-align:center;">
        <div style="font-size:32px;margin-bottom:8px;">${emoji}</div>
        <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:1px;">${title}</h1>
      </td>
    </tr>`;
}
function emailFooter() {
  return `
    <tr>
      <td style="background:#fdf8f5;padding:20px 40px;text-align:center;">
        <p style="color:#b8a090;font-size:12px;margin:0;">© 2026 Tout en Aiguilles — L'art du fil, à chaque maille.</p>
      </td>
    </tr>`;
}
async function sendBrevo(to, toName, subject, htmlContent, textContent) {
  const senderEmail = process.env.SMTP_FROM
    ? process.env.SMTP_FROM.match(/<(.+)>/)?.[1] || process.env.SMTP_FROM
    : process.env.SMTP_USER || 'noreply@toutenaiguilles.fr';
  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'api-key': process.env.BREVO_API_KEY },
    body: JSON.stringify({
      sender: { name: 'Tout en Aiguilles', email: senderEmail },
      to: [{ email: to, name: toName }],
      subject, htmlContent, textContent,
    }),
  });
  if (!response.ok) throw new Error(`Brevo ${response.status}: ${await response.text()}`);
  return { sent: true };
}

// ─── Notification boutique — nouvelle commande ──────────────────
async function sendNewOrderNotification(order) {
  const SHOP_EMAIL = process.env.CONTACT_EMAIL || 'tout.en.aiguilles@gmail.com';
  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        ${emailHeader('🛍️', `Nouvelle commande #${order.id}`)}
        <tr><td style="padding:40px;">
          <p style="color:#6b5547;line-height:1.7;margin:0 0 16px;">
            <strong>${order.first_name} ${order.last_name}</strong> vient de passer une commande.<br>
            <a href="mailto:${order.email}" style="color:#c8937a;">${order.email}</a>
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px;background:#fdf8f5;border-radius:8px;padding:12px 16px;">
            <tr><td style="font-size:13px;color:#9e8070;">Adresse de livraison</td></tr>
            <tr><td style="color:#5a3e2b;">${order.address}, ${order.postal_code} ${order.city}, ${order.country || 'France'}</td></tr>
          </table>
          ${invoiceBlock(order)}
          <div style="text-align:center;margin-top:8px;">
            <a href="${process.env.BASE_URL || 'https://tout-en-aiguilles.com'}/admin/commandes.html"
               style="display:inline-block;background:#c8937a;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;">
              Gérer la commande →
            </a>
          </div>
        </td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;

  if (!process.env.BREVO_API_KEY) {
    console.log(`\n📧 [DEMO] Nouvelle commande #${order.id} — ${order.first_name} ${order.last_name} — ${Number(order.total).toFixed(2)} €\n`);
    return { demo: true };
  }
  return sendBrevo(SHOP_EMAIL, 'Tout en Aiguilles', `🛍️ Nouvelle commande #${order.id} — ${order.first_name} ${order.last_name}`, html,
    `Nouvelle commande #${order.id} de ${order.first_name} ${order.last_name} (${order.email}) — Total : ${Number(order.total).toFixed(2)} €`);
}

// ─── Email client — changement de statut + facture ──────────────
async function sendOrderStatusEmail(order) {
  const status = order.status;
  const items = typeof order.items === 'string' ? JSON.parse(order.items || '[]') : (order.items || []);

  const messages = {
    paid: `Votre paiement a bien été reçu 🎉<br>Nous préparons votre commande avec soin et vous enverrons un email dès son expédition.`,
    shipped: `Votre commande est en route ! 📦<br>Elle sera livrée sous 3 à 5 jours ouvrés.`,
    delivered: `Votre commande a été livrée 🎉<br>Nous espérons qu'elle vous plaît ! N'hésitez pas à laisser un avis.`,
    cancelled: `Votre commande a été annulée.<br>Si vous avez été débité(e), un remboursement sera effectué sous 5 à 10 jours ouvrés.`,
    pending: `Votre commande est enregistrée et en attente de paiement.<br>Complétez votre paiement pour la valider.`,
  };

  const emoji = { paid: '✅', shipped: '📦', delivered: '🎉', cancelled: '❌', pending: '⏳' }[status] || '📋';

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">
        ${emailHeader(emoji, `Commande #${order.id} — ${statusLabel(status)}`)}
        <tr><td style="padding:40px;">
          <h2 style="margin:0 0 16px;color:#5a3e2b;font-size:20px;">Bonjour ${order.first_name} 👋</h2>
          <p style="color:#6b5547;line-height:1.7;margin:0 0 24px;">${messages[status] || `Le statut de votre commande a été mis à jour : <strong>${statusLabel(status)}</strong>`}</p>
          <div style="background:#fdf8f5;border-radius:8px;padding:12px 20px;margin-bottom:24px;">
            <p style="margin:0;color:#9e8070;font-size:12px;">Commande passée le</p>
            <p style="margin:4px 0 0;color:#5a3e2b;font-weight:700;">${formatDate(order.created_at)}</p>
            <p style="margin:12px 0 0;color:#9e8070;font-size:12px;">Adresse de livraison</p>
            <p style="margin:4px 0 0;color:#5a3e2b;">${order.address}, ${order.postal_code} ${order.city}</p>
          </div>
          <h3 style="margin:0 0 4px;color:#5a3e2b;font-size:15px;">Récapitulatif de votre commande</h3>
          ${invoiceBlock(order)}
        </td></tr>
        ${emailFooter()}
      </table>
    </td></tr>
  </table>
</body></html>`;

  if (!process.env.BREVO_API_KEY) {
    console.log(`\n📧 [DEMO] Statut commande #${order.id} → ${status} — email à ${order.email}\n`);
    return { demo: true };
  }
  return sendBrevo(order.email, `${order.first_name} ${order.last_name}`,
    `${emoji} Commande #${order.id} — ${statusLabel(status)}`,
    html,
    `Bonjour ${order.first_name},\n\nLe statut de votre commande #${order.id} est maintenant : ${statusLabel(status)}\n\n— Tout en Aiguilles`);
}

module.exports = { sendVerificationEmail, sendEmailChangeConfirmation, sendContactEmail, sendNewOrderNotification, sendOrderStatusEmail };
