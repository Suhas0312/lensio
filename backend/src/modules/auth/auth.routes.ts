import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { normalizeIndianMobile } from '../../lib/phone';
import { requireAuth, signToken } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { sendEmailCode, sendOtp, verifyEmailCode, verifyOtp } from './otp.service';
import { hashPassword, normalizeEmail, verifyPassword } from './password';
import { Role, User } from '@prisma/client';

const adminEmails = () => env.ADMIN_EMAILS.split(',').map((s) => normalizeEmail(s)).filter(Boolean);
/** Response shape for every successful sign-in. Never returns the password hash. */
const session = (u: User, isNew = false) => {
  const { passwordHash, ...user } = u;
  return { token: signToken({ id: u.id, role: u.role }), user: { ...user, hasPassword: !!passwordHash }, isNew };
};
async function promoteIfAdmin(u: User): Promise<User> {
  if (u.email && adminEmails().includes(u.email) && u.role === 'CUSTOMER')
    return prisma.user.update({ where: { id: u.id }, data: { role: 'ADMIN' as Role } });
  return u;
}
/** Validates and claims a mobile number for this account. Returns the 10-digit number. */
async function claimPhone(userId: string, raw: string) {
  const phone = normalizeIndianMobile(raw);
  if (!phone) throw badRequest('INVALID_PHONE', 'Enter a valid 10-digit mobile number');
  const other = await prisma.user.findUnique({ where: { phone } });
  if (other && other.id !== userId) throw conflict('PHONE_TAKEN', 'Another account already uses this mobile number. Sign in to that account, or use a different number.');
  return phone;
}
const findByEmail = (email: string) => prisma.user.findFirst({ where: { email }, orderBy: { createdAt: 'asc' } });
const emailField = z.string().trim().email('Enter a valid email address').transform(normalizeEmail);
const passwordField = z.string().min(8, 'Use at least 8 characters').max(100);

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false });

const phoneBody = z.object({ phone: z.string().min(10).max(15) });

r.post('/otp/send', limiter, validate(phoneBody.extend({ channel: z.enum(['whatsapp', 'sms']).optional() })), ah(async (req, res) => {
  const phone = normalizeIndianMobile(req.body.phone);
  if (!phone) throw badRequest('INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number');
  const channel = await sendOtp(phone, req.body.channel === 'sms' ? 'sms' : 'whatsapp');
  res.json({ sent: true, channel, expiresInSec: 300 });
}));

r.post('/otp/verify', limiter, validate(phoneBody.extend({ code: z.string().regex(/^\d{6}$/) })), ah(async (req, res) => {
  const phone = normalizeIndianMobile(req.body.phone);
  if (!phone) throw badRequest('INVALID_PHONE', 'Enter a valid 10-digit Indian mobile number');
  await verifyOtp(phone, req.body.code);
  const admins = env.ADMIN_PHONES.split(',').map((s) => s.trim()).filter(Boolean);
  const isAdmin = admins.includes(phone);
  const user = await prisma.user.upsert({
    where: { phone },
    // Numbers added to ADMIN_PHONES later are promoted on their next sign-in.
    update: { phoneVerified: true, ...(isAdmin ? { role: 'ADMIN' as Role } : {}) },
    create: { phone, phoneVerified: true, role: isAdmin ? 'ADMIN' : 'CUSTOMER' },
  });
  res.json(session(user, !user.name));
}));

// ---------- Email + password ----------
r.post('/register', limiter, validate(z.object({ name: z.string().trim().min(1).max(80), email: emailField, password: passwordField, phone: z.string().max(20).optional() })), ah(async (req, res) => {
  const { name, email, password } = req.body;
  const existing = await findByEmail(email);
  if (existing?.passwordHash) throw conflict('ACCOUNT_EXISTS', 'An account with this email already exists. Sign in instead.');
  const phone = req.body.phone ? await claimPhone(existing?.id ?? '', req.body.phone) : undefined;
  const user = existing
    ? await prisma.user.update({ where: { id: existing.id }, data: { name: existing.name ?? name, passwordHash: hashPassword(password), ...(phone && !existing.phone ? { phone } : {}) } })
    : await prisma.user.create({ data: { email, name, phone, passwordHash: hashPassword(password), role: adminEmails().includes(email) ? 'ADMIN' : 'CUSTOMER' } });
  res.status(201).json(session(await promoteIfAdmin(user), !existing));
}));

r.post('/login', limiter, validate(z.object({ email: emailField, password: z.string().min(1).max(100) })), ah(async (req, res) => {
  const user = await findByEmail(req.body.email);
  if (!user || !verifyPassword(req.body.password, user.passwordHash)) {
    if (user && !user.passwordHash) throw badRequest('NO_PASSWORD', 'This account has no password yet. Sign in with an email code, then set a password.');
    throw badRequest('BAD_LOGIN', 'Email or password is incorrect.');
  }
  res.json(session(await promoteIfAdmin(user)));
}));

// ---------- Email code (no password needed; also used for password reset) ----------
r.post('/email-code/send', limiter, validate(z.object({ email: emailField })), ah(async (req, res) => {
  await sendEmailCode(req.body.email);
  res.json({ sent: true, expiresInSec: 600 });
}));

r.post('/email-code/verify', limiter, validate(z.object({
  email: emailField, code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
  newPassword: passwordField.optional(), name: z.string().trim().max(80).optional(),
})), ah(async (req, res) => {
  const { email, code, newPassword, name } = req.body;
  await verifyEmailCode(email, code);
  let user = await findByEmail(email);
  const isNew = !user;
  if (!user) user = await prisma.user.create({ data: { email, name: name || null, role: adminEmails().includes(email) ? 'ADMIN' : 'CUSTOMER' } });
  if (newPassword) user = await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } });
  res.json(session(await promoteIfAdmin(user), isNew));
}));

/** Set or change the password while signed in. */
r.post('/password', requireAuth, validate(z.object({ newPassword: passwordField, currentPassword: z.string().optional() })), ah(async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (user.passwordHash && !verifyPassword(req.body.currentPassword ?? '', user.passwordHash))
    throw badRequest('BAD_PASSWORD', 'Your current password is incorrect.');
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(req.body.newPassword) } });
  res.json({ ok: true });
}));

r.get('/me', requireAuth, ah(async (req, res) => {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  res.json(session(u).user);
}));

r.patch('/me', requireAuth, validate(z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80).optional(), email: z.string().email().optional(),
  phone: z.string().max(20).optional(),
})), ah(async (req, res) => {
  if (req.body.phone !== undefined) {
    req.body.phone = await claimPhone(req.user!.id, req.body.phone);
    const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phone: true } });
    if (me?.phone !== req.body.phone) req.body.phoneVerified = false;   // a changed number must be verified again
  }
  if (req.body.email) {
    req.body.email = normalizeEmail(req.body.email);
    const other = await findByEmail(req.body.email);
    if (other && other.id !== req.user!.id) throw conflict('EMAIL_TAKEN', 'Another account uses this email');
  }
  res.json(session(await prisma.user.update({ where: { id: req.user!.id }, data: req.body })).user);
}));

// Verify the account's mobile number with a WhatsApp (or SMS) code, like Lenskart.
r.post('/phone/send', requireAuth, limiter, validate(z.object({ phone: z.string().max(20) })), ah(async (req, res) => {
  const phone = await claimPhone(req.user!.id, req.body.phone);
  res.json({ sent: true, channel: await sendOtp(phone) });
}));
r.post('/phone/verify', requireAuth, limiter, validate(z.object({ phone: z.string().max(20), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code') })), ah(async (req, res) => {
  const phone = await claimPhone(req.user!.id, req.body.phone);
  await verifyOtp(phone, req.body.code);
  res.json(session(await prisma.user.update({ where: { id: req.user!.id }, data: { phone, phoneVerified: true } })).user);
}));

// Addresses
const optPhone = z.string().max(20).optional().or(z.literal('').transform(() => undefined));
const addressSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the full name').max(80),
  phone: z.string().trim().min(10, 'Enter a 10-digit mobile number').max(20),
  altPhone: optPhone,
  line1: z.string().trim().min(3, 'Enter house / flat number and street').max(200),
  line2: z.string().trim().max(200).optional(), landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, 'Enter the city').max(60), state: z.string().trim().min(2, 'Enter the state').max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  isDefault: z.boolean().optional(),
});
function cleanAddress(b: z.infer<typeof addressSchema>) {
  const phone = normalizeIndianMobile(b.phone);
  if (!phone) throw badRequest('INVALID_PHONE', 'Enter a valid 10-digit mobile number for delivery', { fieldErrors: { phone: ['Enter a valid 10-digit mobile number'] } });
  let altPhone: string | null = null;
  if (b.altPhone) {
    altPhone = normalizeIndianMobile(b.altPhone);
    if (!altPhone) throw badRequest('INVALID_PHONE', 'Check the alternate mobile number', { fieldErrors: { altPhone: ['Enter a valid 10-digit mobile number, or leave it empty'] } });
    if (altPhone === phone) altPhone = null;
  }
  const { isDefault: _d, ...rest } = b;
  return { ...rest, phone, altPhone, line2: b.line2 || null, landmark: b.landmark || null };
}
/** The first delivery number becomes the account's mobile number if it has none (older accounts). */
async function fillAccountPhone(userId: string, phone: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (u && !u.phone && !(await prisma.user.findUnique({ where: { phone } }))) await prisma.user.update({ where: { id: userId }, data: { phone } });
}

r.get('/addresses', requireAuth, ah(async (req, res) => {
  res.json(await prisma.address.findMany({ where: { userId: req.user!.id, archived: false }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }));
}));
r.post('/addresses', requireAuth, validate(addressSchema), ah(async (req, res) => {
  const data = cleanAddress(req.body);
  const count = await prisma.address.count({ where: { userId: req.user!.id, archived: false } });
  const isDefault = req.body.isDefault ?? count === 0;
  const addr = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    return tx.address.create({ data: { ...data, isDefault, userId: req.user!.id } });
  });
  await fillAccountPhone(req.user!.id, data.phone);
  res.status(201).json(addr);
}));
/** Edit. Addresses already used by orders are kept unchanged for those orders; a new copy is saved instead. */
r.put('/addresses/:id', requireAuth, validate(addressSchema), ah(async (req, res) => {
  const old = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.id, archived: false }, include: { _count: { select: { orders: true } } } });
  if (!old) throw notFound('Address');
  const data = cleanAddress(req.body);
  const isDefault = req.body.isDefault ?? old.isDefault;
  const addr = await prisma.$transaction(async (tx) => {
    if (isDefault) await tx.address.updateMany({ where: { userId: req.user!.id }, data: { isDefault: false } });
    if (!old._count.orders) return tx.address.update({ where: { id: old.id }, data: { ...data, isDefault } });
    await tx.address.update({ where: { id: old.id }, data: { archived: true, isDefault: false } });
    return tx.address.create({ data: { ...data, isDefault, userId: req.user!.id } });
  });
  res.json(addr);
}));
r.delete('/addresses/:id', requireAuth, ah(async (req, res) => {
  const old = await prisma.address.findFirst({ where: { id: req.params.id, userId: req.user!.id }, include: { _count: { select: { orders: true } } } });
  if (old) {
    // Used by an order: hide it from the list but keep it for that order's delivery details.
    if (old._count.orders) await prisma.address.update({ where: { id: old.id }, data: { archived: true, isDefault: false } });
    else await prisma.address.delete({ where: { id: old.id } });
    if (old.isDefault) {
      const next = await prisma.address.findFirst({ where: { userId: req.user!.id, archived: false }, orderBy: { createdAt: 'desc' } });
      if (next) await prisma.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  }
  res.status(204).end();
}));

/** PIN code → city and state (India Post data), so customers don't have to type them. */
const pinCache = new Map<string, { city: string; state: string } | null>();
r.get('/pincode/:pin', ah(async (req, res) => {
  const pin = req.params.pin;
  if (!/^[1-9]\d{5}$/.test(pin)) throw badRequest('INVALID_PIN', 'Enter a valid 6-digit PIN code');
  if (!pinCache.has(pin)) {
    try {
      const r2 = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(5000) });
      const j = (await r2.json()) as { Status?: string; PostOffice?: { District?: string; State?: string }[] }[];
      const po = j?.[0]?.Status === 'Success' ? j[0].PostOffice?.[0] : undefined;
      pinCache.set(pin, po?.District && po.State ? { city: po.District, state: po.State } : null);
      if (pinCache.size > 5000) pinCache.delete(pinCache.keys().next().value as string);
    } catch { return res.json({ found: false }); }   // lookup service down: customer types it
  }
  const hit = pinCache.get(pin);
  res.json(hit ? { found: true, ...hit } : { found: false });
}));


export default r;
