import type { OutgoingEmail } from '../modules/email/email.service';

const PRODUCT = 'Komyosys POS';
const BRAND = '#C23F02';

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function layout(heading: string, intro: string, cta: string, link: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f6f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111827">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:12px;padding:32px">
<tr><td style="font-size:14px;font-weight:600;color:${BRAND}">${PRODUCT}</td></tr>
<tr><td style="padding-top:16px;font-size:20px;font-weight:600">${escape(heading)}</td></tr>
<tr><td style="padding-top:12px;font-size:15px;line-height:1.5;color:#374151">${intro}</td></tr>
<tr><td style="padding-top:24px"><a href="${escape(link)}" style="display:inline-block;background:${BRAND};color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:8px">${escape(cta)}</a></td></tr>
<tr><td style="padding-top:24px;font-size:13px;line-height:1.5;color:#6b7280">${footer}<br><br>Button not working? Paste this link into your browser:<br><span style="word-break:break-all">${escape(link)}</span></td></tr>
</table></td></tr></table></body></html>`;
}

export function passwordResetEmail(to: string, name: string, restaurant: string, link: string): OutgoingEmail {
  const intro = `Hi ${escape(name)}, someone asked to reset the password for your ${PRODUCT} account at <strong>${escape(restaurant)}</strong>.`;
  const footer = 'This link works once and expires in 30 minutes. If you didn&rsquo;t ask for this, ignore this email: your password stays the same.';
  return {
    to,
    subject: `Reset your ${PRODUCT} password`,
    text: `Hi ${name},\n\nSomeone asked to reset the password for your ${PRODUCT} account at ${restaurant}.\n\nReset it here (works once, expires in 30 minutes):\n${link}\n\nIf you didn't ask for this, ignore this email: your password stays the same.\n`,
    html: layout('Reset your password', intro, 'Choose a new password', link, footer),
  };
}

export function verifyEmail(to: string, name: string, restaurant: string, link: string): OutgoingEmail {
  const intro = `Hi ${escape(name)}, welcome to ${PRODUCT}! Please confirm this is your email address for <strong>${escape(restaurant)}</strong>.`;
  const footer = 'This link expires in 24 hours. If you didn&rsquo;t create this account, ignore this email.';
  return {
    to,
    subject: `Confirm your email for ${PRODUCT}`,
    text: `Hi ${name},\n\nWelcome to ${PRODUCT}! Please confirm this is your email address for ${restaurant}:\n${link}\n\nThis link expires in 24 hours. If you didn't create this account, ignore this email.\n`,
    html: layout('Confirm your email', intro, 'Confirm email', link, footer),
  };
}
