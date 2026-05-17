const { Resend } = require('resend');

function getClient() {
  if (!process.env.RESEND_API_KEY) return null;
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendResetCode(email, code) {
  const client = getClient();

  if (!client) {
    console.log('\n' + '─'.repeat(52));
    console.log('  Safe Seas — Password Reset Code (dev mode)');
    console.log('─'.repeat(52));
    console.log(`  Email : ${email}`);
    console.log(`  Code  : ${code}`);
    console.log('─'.repeat(52) + '\n');
    return;
  }

  const from = process.env.RESEND_FROM || 'Safe Seas <onboarding@resend.dev>';

  const { error } = await client.emails.send({
    from,
    to: email,
    subject: `${code} is your Safe Seas reset code`,
    text: [
      `Your Safe Seas password reset code is: ${code}`,
      '',
      'This code expires in 15 minutes.',
      "If you didn't request this, you can safely ignore this email.",
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0A1420;color:#F1F5F9;border-radius:16px;">
        <p style="font-size:13px;color:#7E94AE;margin:0 0 24px;letter-spacing:0.1em;text-transform:uppercase;">Safe Seas · Password Reset</p>
        <h1 style="font-size:22px;margin:0 0 8px;color:#F1F5F9;">Reset your password</h1>
        <p style="color:#7E94AE;font-size:14px;margin:0 0 28px;line-height:1.6;">Enter the code below in the app. It expires in 15 minutes.</p>
        <div style="text-align:center;padding:24px 16px;background:#13202E;border-radius:14px;border:1px solid #1E2F42;margin-bottom:28px;">
          <span style="font-size:40px;font-weight:700;letter-spacing:0.35em;color:#22E3D0;font-family:monospace;">${code}</span>
        </div>
        <p style="color:#5B7791;font-size:12px;margin:0;line-height:1.6;">If you didn't request a password reset, you can ignore this email — your account is safe.</p>
      </div>
    `,
  });

  if (error) {
    // Resend rejected the send (e.g. unverified domain) — print to console so dev flow still works
    console.log('\n' + '─'.repeat(52));
    console.log('  Safe Seas — Password Reset Code (Resend blocked)');
    console.log('─'.repeat(52));
    console.log(`  Resend error : ${error.message}`);
    console.log(`  Email        : ${email}`);
    console.log(`  Code         : ${code}`);
    console.log('  Fix: verify a domain at resend.com/domains');
    console.log('─'.repeat(52) + '\n');
  }
}

module.exports = { sendResetCode };
