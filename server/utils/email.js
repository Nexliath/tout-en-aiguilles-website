const nodemailer = require('nodemailer');

// ─── Transporteur SMTP ───────────────────────────────────────
function createTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null; // Mode démo : log dans la console
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─── Email de vérification ───────────────────────────────────
async function sendVerificationEmail(toEmail, firstName, token, baseUrl) {
  const verifyUrl = `${baseUrl}/verify-email.html?token=${token}`;
  const from = process.env.SMTP_FROM || 'Tout en Aiguilles <noreply@toutenaiguilles.fr>';

  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fdf8f5;font-family:Georgia,serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fdf8f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#c8937a,#e8b89a);padding:36px 40px;text-align:center;">
            <div style="font-size:32px;margin-bottom:8px;">🧶</div>
            <h1 style="margin:0;color:#fff;font-size:22px;font-weight:normal;letter-spacing:1px;">Tout en Aiguilles</h1>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px;color:#5a3e2b;font-size:20px;">Bonjour ${firstName} 👋</h2>
            <p style="color:#6b5547;line-height:1.7;margin:0 0 24px;">
              Merci de vous être inscrit(e) sur <strong>Tout en Aiguilles</strong> !<br>
              Pour activer votre compte, il vous suffit de cliquer sur le bouton ci-dessous.
            </p>

            <div style="text-align:center;margin:32px 0;">
              <a href="${verifyUrl}"
                 style="display:inline-block;background:#c8937a;color:#fff;text-decoration:none;
                        padding:14px 36px;border-radius:8px;font-size:16px;font-family:Georgia,serif;
                        letter-spacing:0.5px;">
                ✅ Confirmer mon adresse email
              </a>
            </div>

            <p style="color:#9e8070;font-size:13px;line-height:1.6;margin:0 0 8px;">
              Ce lien est valable pendant <strong>24 heures</strong>.<br>
              Si vous n'avez pas créé de compte, ignorez simplement cet email.
            </p>

            <hr style="border:none;border-top:1px solid #f0e8e0;margin:28px 0;">

            <p style="color:#b8a090;font-size:12px;margin:0;">
              Lien de secours :<br>
              <a href="${verifyUrl}" style="color:#c8937a;word-break:break-all;">${verifyUrl}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#fdf8f5;padding:20px 40px;text-align:center;">
            <p style="color:#b8a090;font-size:12px;margin:0;">
              © 2026 Tout en Aiguilles — L'art du fil, à chaque maille.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const transporter = createTransporter();

  if (!transporter) {
    // Mode démo : afficher le lien dans la console
    console.log('\n📧 [MODE DÉMO — EMAIL NON ENVOYÉ]');
    console.log(`   Destinataire : ${toEmail}`);
    console.log(`   Lien de vérification : ${verifyUrl}\n`);
    return { demo: true };
  }

  await transporter.sendMail({
    from,
    to: toEmail,
    subject: '✅ Confirmez votre adresse email — Tout en Aiguilles',
    html,
    text: `Bonjour ${firstName},\n\nMerci de vous être inscrit(e) sur Tout en Aiguilles !\n\nConfirmez votre email en cliquant sur ce lien :\n${verifyUrl}\n\nCe lien est valable 24 heures.\n\n— Tout en Aiguilles`,
  });

  return { sent: true };
}

module.exports = { sendVerificationEmail };
