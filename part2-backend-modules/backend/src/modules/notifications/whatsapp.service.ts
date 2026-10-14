import { OrderStatus } from '@prisma/client';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { normalizeIndianMobile, toE164NoPlus } from '../../lib/phone';
import { sendMail, sendOrderEmail } from '../../lib/mail';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PAYMENT_PENDING: 'Awaiting payment',
  PLACED: 'Order placed',
  PRESCRIPTION_VERIFIED: 'Prescription verified',
  LENS_CUTTING_FITTING: 'Lens cutting & fitting',
  QUALITY_CHECK: 'Quality check',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

/**
 * WhatsApp Business (Meta Cloud API). Templates to create and get approved in Meta Business Manager
 * (WhatsApp Manager → Message templates), language English:
 *
 *   login_code          Authentication · "{{1}} is your verification code." + Copy code button
 *   order_update        Utility · "Hi {{1}}, your Lensio order {{2}} is now: {{3}}. {{4}}"
 *   prescription_needed Utility · "Hi {{1}}, upload your prescription for order {{2}} so we can start cutting your lenses."
 *   eye_test_update     Utility · "Hi {{1}}, your Lensio eye test at home: {{2}}. {{3}}"
 *   owner_alert         Utility · "Lensio alert: {{1}}. {{2}}"
 *
 * Every message is also sent by email where we have one. Failures are logged and never break an order.
 */
export const whatsappEnabled = () => !!(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);

/** Meta rejects template parameters with new lines, tabs, more than 4 spaces in a row, or empty text. */
export const cleanParam = (t: string | null | undefined) =>
  (String(t ?? '').replace(/[\r\n\t]+/g, ' ').replace(/ {4,}/g, '   ').trim() || '-').slice(0, 900);

async function post(phone10: string, template: string, components: unknown[]): Promise<boolean> {
  if (!whatsappEnabled()) { logger.info({ phone10, template }, '[WhatsApp not set up] message skipped'); return false; }
  const body = JSON.stringify({
    messaging_product: 'whatsapp', to: toE164NoPlus(phone10), type: 'template',
    template: { name: template, language: { code: env.WHATSAPP_TEMPLATE_LANG }, components },
  });
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetch(`https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: 'POST', headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
        body, signal: AbortSignal.timeout(10_000),
      });
      if (resp.ok) return true;
      const text = await resp.text();
      logger.warn({ status: resp.status, template, body: text.slice(0, 500) }, 'WhatsApp send failed');
      if (resp.status < 500 && resp.status !== 429) return false;   // bad template/number: retrying won't help
    } catch (err) {
      logger.warn({ err, template }, 'WhatsApp send error');
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

/** Template with body parameters only. */
export function sendTemplate(phone10: string, template: string, params: string[]) {
  return post(phone10, template, [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: cleanParam(p) })) }]);
}

/** Login code (Authentication template with a "Copy code" button). */
export function sendOtpWhatsApp(phone10: string, code: string) {
  return post(phone10, env.WHATSAPP_OTP_TEMPLATE, [
    { type: 'body', parameters: [{ type: 'text', text: code }] },
    { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
  ]);
}

/** Any update about an order: WhatsApp + email. headline is short ("Out for delivery"), detail is one sentence. */
export async function notifyOrderUpdate(o: { phone?: string | null; email?: string | null; name: string | null; orderNumber: string; headline: string; detail: string }) {
  await Promise.all([
    o.email ? sendOrderEmail(o.email, o.name, o.orderNumber, o.headline, o.detail).catch(() => {}) : null,
    o.phone ? sendTemplate(o.phone, 'order_update', [o.name ?? 'there', o.orderNumber, o.headline, o.detail]) : null,
  ]);
}

/** Order status change (called for every step, automatic or by the shop). */
export async function notifyOrderStatus(o: { phone?: string | null; email?: string | null; name: string | null; orderNumber: string; status: OrderStatus; trackingUrl?: string | null }) {
  const detail = o.status === 'DISPATCHED' && o.trackingUrl ? `Track it: ${o.trackingUrl}`
    : o.status === 'PLACED' ? 'We\'ll message you at every step.'
    : o.status === 'PRESCRIPTION_VERIFIED' ? 'Our optician has checked your prescription.'
    : o.status === 'LENS_CUTTING_FITTING' ? 'This usually takes 2–4 days.'
    : o.status === 'QUALITY_CHECK' ? 'Your glasses are being checked before packing.'
    : o.status === 'DELIVERED' ? 'Enjoy your new glasses! Reply here if anything needs adjusting.'
    : o.status === 'CANCELLED' ? 'Any payment made will be refunded in 5–7 working days.' : 'Thanks for choosing Lensio.';
  await notifyOrderUpdate({ ...o, headline: STATUS_LABEL[o.status], detail });
}

/** Home eye-test booking updates. */
export async function notifyEyeTest(o: { phone: string; email?: string | null; name: string | null; headline: string; detail: string }) {
  await Promise.all([
    sendTemplate(o.phone, 'eye_test_update', [o.name ?? 'there', o.headline, o.detail]),
    o.email ? sendMail(o.email, `Lensio eye test at home: ${o.headline}`, `Hi ${o.name ?? 'there'}, your Lensio eye test at home: ${o.headline}. ${o.detail}`).catch(() => {}) : null,
  ]);
}

/** Owner alerts on WhatsApp (OWNER_WHATSAPP_NUMBERS), in addition to email. */
export async function whatsappOwner(title: string, detail: string) {
  const nums = (env.OWNER_WHATSAPP_NUMBERS ?? '').split(',').map((n) => normalizeIndianMobile(n.trim())).filter((n): n is string => !!n);
  await Promise.all(nums.map((n) => sendTemplate(n, 'owner_alert', [title, detail])));
}
