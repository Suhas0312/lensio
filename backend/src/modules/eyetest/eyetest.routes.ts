import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { notFound } from '../../lib/errors';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { alertOwner } from '../notifications/owner.service';
import { notifyEyeTest } from '../notifications/whatsapp.service';

const r = Router();
r.use(requireAuth);

const SLOTS = ['Morning (9am-12pm)', 'Afternoon (12pm-4pm)', 'Evening (4pm-8pm)'] as const;

const createSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number'),
  addressLine: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(60),
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code'),
  preferredDate: z.coerce.date().refine((d) => d.getTime() > Date.now() - 86_400_000, 'Pick today or a future date'),
  preferredSlot: z.enum(SLOTS),
  notes: z.string().trim().max(500).optional(),
});

/** Customer requests a home eye-test visit. This creates a lead for the shop to call and schedule — no logistics are automated. */
r.post('/', validate(createSchema), ah(async (req, res) => {
  const reqRow = await prisma.eyeTestRequest.create({ data: { ...req.body, userId: req.user!.id } });
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { email: true } });
  void notifyEyeTest({ phone: reqRow.phone, email: me?.email, name: reqRow.fullName, headline: 'Request received',
    detail: `Preferred ${req.body.preferredDate.toDateString()}, ${req.body.preferredSlot}. We'll confirm the time shortly.` });
  void alertOwner('eye_test', `Home eye-test request from ${req.body.fullName}`, [
    `+91 ${req.body.phone} · ${req.body.city} ${req.body.pincode}`,
    `Preferred: ${req.body.preferredDate.toDateString()} · ${req.body.preferredSlot}`,
    req.body.notes ? `Notes: ${req.body.notes}` : '',
  ].filter(Boolean));
  res.status(201).json(reqRow);
}));

r.get('/mine', ah(async (req, res) => {
  res.json(await prisma.eyeTestRequest.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } }));
}));

r.delete('/:id', ah(async (req, res) => {
  const row = await prisma.eyeTestRequest.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!row) throw notFound('Request');
  if (row.status === 'REQUESTED') await prisma.eyeTestRequest.update({ where: { id: row.id }, data: { status: 'CANCELLED' } });
  res.status(204).end();
}));

export default r;
