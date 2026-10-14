import crypto from 'crypto';
import { env, isProd } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { AppError, badRequest } from '../../lib/errors';
import { toE164NoPlus } from '../../lib/phone';
import { sendOtpWhatsApp, whatsappEnabled } from '../notifications/whatsapp.service';

const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;
const MAX_PER_HOUR = 5;

const hash = (phone: string, code: string) =>
  crypto.createHmac('sha256', env.JWT_SECRET).update(`${phone}:${code}`).digest('hex');

export type OtpChannel = 'whatsapp' | 'sms';
export const smsEnabled = () => !!(env.MSG91_AUTH_KEY && env.MSG91_TEMPLATE_ID);

async function sendSms(phone: string, code: string) {
  const resp = await fetch('https://control.msg91.com/api/v5/otp?' + new URLSearchParams({
    template_id: env.MSG91_TEMPLATE_ID!, mobile: toE164NoPlus(phone), otp: code,
  }), { method: 'POST', headers: { authkey: env.MSG91_AUTH_KEY!, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10_000) });
  if (!resp.ok) logger.error({ status: resp.status }, 'MSG91 send failed');
  return resp.ok;
}

/** Sends a login code on WhatsApp (preferred), falling back to SMS. Returns how it was sent. */
export async function sendOtp(phone: string, prefer: OtpChannel = 'whatsapp'): Promise<OtpChannel> {
  if (env.REVIEW_PHONE && env.REVIEW_OTP && phone === env.REVIEW_PHONE) return 'sms'; // store reviewers use the fixed code
  const hourAgo = new Date(Date.now() - 3600_000);
  const recent = await prisma.otpCode.findMany({ where: { phone, createdAt: { gt: hourAgo } }, orderBy: { createdAt: 'desc' } });
  if (recent.length >= MAX_PER_HOUR) throw new AppError(429, 'OTP_LIMIT', 'Too many codes requested. Try again in an hour.');
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS)
    throw new AppError(429, 'OTP_COOLDOWN', 'Wait 30 seconds before requesting another code.');

  const code = crypto.randomInt(100000, 1000000).toString();
  await prisma.otpCode.create({ data: { phone, codeHash: hash(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) } });

  const order: OtpChannel[] = prefer === 'sms' ? ['sms', 'whatsapp'] : ['whatsapp', 'sms'];
  for (const ch of order) {
    if (ch === 'whatsapp' && whatsappEnabled() && (await sendOtpWhatsApp(phone, code))) return 'whatsapp';
    if (ch === 'sms' && smsEnabled() && (await sendSms(phone, code).catch(() => false))) return 'sms';
  }
  if (!whatsappEnabled() && !smsEnabled() && (!isProd || env.OTP_LOG_CODES === 'true')) {
    logger.warn(`[SETUP] OTP for ${phone}: ${code}`);
    return prefer;
  }
  throw new AppError(502, 'OTP_SEND_FAILED', 'Could not send the code. Check the number and try again, or sign in with email.');
}

/**
 * Checks a code against every unused, unexpired code for this phone/email (newest first).
 * Customers often receive two codes (a resend or double tap) and type the first one; that must still work.
 * Wrong attempts are counted across all of them, so guessing is still limited to MAX_ATTEMPTS.
 */
async function checkCode(where: { phone: string } | { email: string }, key: string, code: string) {
  const live = await prisma.otpCode.findMany({ where: { ...where, consumed: false, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' }, take: 5 });
  if (!live.length) throw badRequest('OTP_EXPIRED', 'This code has expired. Request a new one.');
  const wrong = live.reduce((n, o) => n + o.attempts, 0);
  if (wrong >= MAX_ATTEMPTS) throw badRequest('OTP_LOCKED', 'Too many wrong attempts. Request a new code.');
  const b = Buffer.from(hash(key, code));
  const hit = live.find((o) => { const a = Buffer.from(o.codeHash); return a.length === b.length && crypto.timingSafeEqual(a, b); });
  if (!hit) {
    await prisma.otpCode.update({ where: { id: live[0].id }, data: { attempts: { increment: 1 } } });
    throw badRequest('OTP_INVALID', 'That code is incorrect. Use the code from the newest message, or tap Resend.');
  }
  // Signed in: retire every outstanding code for this phone/email.
  await prisma.otpCode.updateMany({ where: { ...where, consumed: false }, data: { consumed: true } });
}

export async function verifyOtp(phone: string, code: string) {
  if (env.REVIEW_PHONE && env.REVIEW_OTP && phone === env.REVIEW_PHONE) {
    if (code === env.REVIEW_OTP) return;
    throw badRequest('OTP_INVALID', 'That code is incorrect.');
  }
  await checkCode({ phone }, phone, code);
}

// ---------------- Email codes (free, via Brevo) ----------------
import { sendCodeEmail } from '../../lib/mail';

const EMAIL_TTL_MS = 10 * 60 * 1000;

export async function sendEmailCode(email: string) {
  const hourAgo = new Date(Date.now() - 3600_000);
  const recent = await prisma.otpCode.findMany({ where: { email, createdAt: { gt: hourAgo } }, orderBy: { createdAt: 'desc' } });
  if (recent.length >= MAX_PER_HOUR) throw new AppError(429, 'OTP_LIMIT', 'Too many codes requested. Try again in an hour.');
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_COOLDOWN_MS)
    throw new AppError(429, 'OTP_COOLDOWN', 'Wait 30 seconds before requesting another code.');
  const code = crypto.randomInt(100000, 1000000).toString();
  await prisma.otpCode.create({ data: { email, codeHash: hash(email, code), expiresAt: new Date(Date.now() + EMAIL_TTL_MS) } });
  const sent = await sendCodeEmail(email, code);
  if (!sent && (!isProd || env.OTP_LOG_CODES === 'true')) logger.warn(`[SETUP] Email code for ${email}: ${code}`);
  else if (!sent) throw new AppError(502, 'EMAIL_SEND_FAILED', 'Could not send the email. Try again, or sign in with your password.');
}

export async function verifyEmailCode(email: string, code: string) {
  if (env.REVIEW_EMAIL && env.REVIEW_OTP && email === env.REVIEW_EMAIL) {
    if (code === env.REVIEW_OTP) return;
    throw badRequest('OTP_INVALID', 'That code is incorrect.');
  }
  await checkCode({ email }, email, code);
}
