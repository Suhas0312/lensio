import { env, isProd } from '../config/env';
import { logger } from './logger';

export const mailEnabled = () => !!(env.BREVO_API_KEY && env.MAIL_FROM);

/** Sends an email through Brevo's HTTPS API (works on hosts that block SMTP, like Render's free plan). */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  if (!mailEnabled()) {
    if (!isProd || env.OTP_LOG_CODES === 'true') logger.warn({ to, subject, text }, '[SETUP] email not configured; would send');
    return false;
  }
  try {
    const r = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': env.BREVO_API_KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: env.MAIL_FROM_NAME, email: env.MAIL_FROM },
        to: [{ email: to }], subject, textContent: text, htmlContent: html ?? `<p>${text.replace(/\n/g, '<br>')}</p>`,
      }),
    });
    if (!r.ok) { logger.error({ status: r.status, body: await r.text() }, 'Brevo send failed'); return false; }
    return true;
  } catch (err) {
    logger.error({ err }, 'Brevo send error');
    return false;
  }
}

const wrap = (inner: string, instagramUrl?: string | null) => `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#161A3A">
  <div style="background:#040722;color:#fff;border-radius:12px;padding:16px 20px;font-size:20px;font-weight:bold">Lensio</div>
  <div style="padding:20px 4px;font-size:15px;line-height:1.5">${inner}</div>
  ${instagramUrl ? `<p style="margin:0 4px 14px;font-size:14px">📸 New styles every week: <a href="${instagramUrl}" style="color:#C94EF2;font-weight:bold">follow us on Instagram</a></p>` : ''}
  <div style="color:#8A8FB0;font-size:12px">Your lens, our world</div></div>`;

/** Instagram link from shop settings, for email footers (lazy import avoids a load-order cycle). */
async function igLink(): Promise<string | null> {
  try { const { getSettings } = await import('../modules/settings/settings.service'); return (await getSettings()).instagramUrl; } catch { return null; }
}

export function sendCodeEmail(to: string, code: string) {
  return sendMail(to, `${code} is your Lensio code`,
    `Your Lensio sign-in code is ${code}. It expires in 10 minutes. If you didn't ask for it, ignore this email.`,
    wrap(`<p>Your sign-in code is</p><p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:8px 0">${code}</p>
      <p>It expires in 10 minutes. If you didn't ask for it, you can ignore this email.</p>`));
}

export async function sendOrderEmail(to: string, name: string | null, orderNumber: string, label: string, extra: string) {
  const ig = await igLink();
  return sendMail(to, `Order ${orderNumber}: ${label}`,
    `Hi ${name ?? 'there'}, your Lensio order ${orderNumber} is now: ${label}. ${extra}${ig ? `\n\nFollow us on Instagram: ${ig}` : ''}`,
    wrap(`<p>Hi ${name ?? 'there'},</p><p>Your order <b>${orderNumber}</b> is now:</p><p style="font-size:20px;font-weight:bold">${label}</p><p>${extra}</p>`, ig));
}

/** Sent ~2 days after delivery: asks the customer to rate what they bought. */
export async function sendReviewRequestEmail(to: string, name: string | null, orderNumber: string, products: string[], link: string, points: number) {
  const ig = await igLink();
  const list = products.slice(0, 4).join(', ');
  return sendMail(to, `How are your new glasses? Rate ${products[0] ?? 'your order'}`,
    `Hi ${name ?? 'there'}, we hope you're enjoying ${list} from order ${orderNumber}. Could you take a minute to rate them? It helps other shoppers choose. ${link}${ig ? `\n\nFollow us on Instagram: ${ig}` : ''}`,
    wrap(`<p>Hi ${name ?? 'there'},</p><p>We hope you're enjoying your new <b>${list}</b> (order ${orderNumber}).</p>
      <p>Could you take a minute to rate them? Your review helps other shoppers find the right pair.</p>
      <p style="font-size:26px;letter-spacing:4px;color:#F5A524;margin:6px 0">★★★★★</p>
      <p><a href="${link}" style="display:inline-block;background:#7B61FF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:bold">Rate my frames</a></p>
      ${points ? `<p style="font-size:13px;color:#5E6388">You earned <b>${points} Lensio points</b> on this order, worth ₹${points} off your next pair.</p>` : ''}`, ig));
}
