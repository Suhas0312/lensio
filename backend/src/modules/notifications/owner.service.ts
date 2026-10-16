import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { sendMail } from '../../lib/mail';
import { getSettings } from '../settings/settings.service';
import { whatsappOwner } from './whatsapp.service';

export type OwnerAlert = 'new_order' | 'payment_to_check' | 'prescription_to_review' | 'cancelled' | 'courier_problem' | 'eye_test' | 'review';

const ICON: Record<OwnerAlert, string> = {
  new_order: '🛍️', payment_to_check: '💰', prescription_to_review: '👓', cancelled: '✖️', courier_problem: '⚠️', eye_test: '🏠', review: '⭐',
};

/** Where alerts go: ADMIN_EMAILS (Render) plus the addresses typed in admin → Settings, without duplicates. */
export function alertRecipients(fromSettings: string) {
  return [...new Set([...env.ADMIN_EMAILS.split(','), ...fromSettings.split(',')].map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];
}

/**
 * Emails the shop owner(s) (everyone in ADMIN_EMAILS) about something that needs attention.
 * Never throws: an alert failing must not break an order.
 */
export async function alertOwner(kind: OwnerAlert, title: string, lines: string[], orderId?: string) {
  try {
    const s = await getSettings();
    if (!s.ownerEmailAlerts) return;
    const to = alertRecipients(s.alertEmails);
    if (!to.length && !env.OWNER_WHATSAPP_NUMBERS) return;
    const link = `${env.PUBLIC_BASE_URL.replace(/\/$/, '')}/admin/${orderId ? `#order=${orderId}` : ''}`;
    const subject = `${ICON[kind]} ${title}`;
    const text = `${title}\n\n${lines.join('\n')}\n\nOpen in the admin panel: ${link}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:20px;color:#161A3A">
      <div style="background:#040722;color:#fff;border-radius:12px;padding:14px 18px;font-size:18px;font-weight:bold">Lensio admin</div>
      <h2 style="font-size:18px;margin:18px 0 8px">${ICON[kind]} ${title}</h2>
      ${lines.map((l) => `<p style="margin:4px 0">${l.replace(/</g, '&lt;')}</p>`).join('')}
      <p style="margin-top:18px"><a href="${link}" style="background:#7B61FF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:bold">Open in admin panel</a></p></div>`;
    await Promise.all([...to.map((addr) => sendMail(addr, subject, text, html)), whatsappOwner(title, `${lines.filter(Boolean).slice(0, 3).join(' · ')} · ${link}`)]);
  } catch (err) {
    logger.warn({ err, kind }, 'Owner alert failed');
  }
}
