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

module.exports = { sendVerificationEmail };
