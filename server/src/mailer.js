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

  // Resend free tier requires a verified domain to send to arbitrary recipients.
  // Until a domain is verified, redirect all outgoing mail to the account owner.
  const TEST_OVERRIDE = 'noreplysafeseas@gmail.com';
  const recipient = TEST_OVERRIDE;

  const { error } = await client.emails.send({
    from,
    to: recipient,
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
    console.log('\n' + '─'.repeat(52));
    console.log('  Safe Seas — Password Reset Code (Resend error)');
    console.log('─'.repeat(52));
    console.log(`  Resend error : ${error.message}`);
    console.log(`  Intended for : ${email}`);
    console.log(`  Sent to      : ${recipient}`);
    console.log(`  Code         : ${code}`);
    console.log('─'.repeat(52) + '\n');
  } else {
    console.log(`Reset code sent to ${recipient} (requested by ${email})`);
  }
}

async function sendFeedback(fromUser, message) {
  const client = getClient();
  const DEST = 'noreplysafeseas@gmail.com';

  if (!client) {
    console.log('\n' + '─'.repeat(52));
    console.log('  Safe Seas — Feedback (dev mode)');
    console.log('─'.repeat(52));
    console.log(`  From    : ${fromUser}`);
    console.log(`  Message : ${message}`);
    console.log('─'.repeat(52) + '\n');
    return;
  }

  const from = process.env.RESEND_FROM || 'Safe Seas <onboarding@resend.dev>';
  const { error } = await client.emails.send({
    from,
    to: DEST,
    subject: `Safe Seas feedback from ${fromUser}`,
    text: `From: ${fromUser}\n\n${message}`,
    html: `
      <div style="font-family:-apple-system,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0A1420;color:#F1F5F9;border-radius:16px;">
        <p style="font-size:13px;color:#7E94AE;margin:0 0 24px;letter-spacing:0.1em;text-transform:uppercase;">Safe Seas · User Feedback</p>
        <h1 style="font-size:20px;margin:0 0 6px;color:#F1F5F9;">New feedback</h1>
        <p style="color:#7E94AE;font-size:13px;margin:0 0 20px;">From: <strong style="color:#C5D2E0;">${fromUser}</strong></p>
        <div style="background:#13202E;border:1px solid #1E2F42;border-radius:12px;padding:18px 20px;white-space:pre-wrap;font-size:14px;line-height:1.6;color:#F1F5F9;">${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
      </div>
    `,
  });

  if (error) console.warn('Feedback email error:', error.message);
}

module.exports = { sendResetCode, sendFeedback };
