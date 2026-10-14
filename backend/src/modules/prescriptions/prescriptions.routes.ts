import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { LensType, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { badRequest, notFound } from '../../lib/errors';
import { putPrivateFile, signedUrl } from '../../lib/storage';
import { requireAuth } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { validatePrescription } from './rx.rules';

const r = Router();
r.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['image/jpeg', 'image/png', 'image/heic', 'image/webp', 'application/pdf'].includes(file.mimetype);
    if (ok) cb(null, true);
    else cb(badRequest('BAD_FILE_TYPE', 'Upload a photo (JPG, PNG, HEIC) or a PDF of your prescription'));
  },
});

const num = z.coerce.number().nullable().optional();
const eye = z.object({ sph: num, cyl: num, axis: z.coerce.number().int().nullable().optional(), add: num, near: num });
const manualSchema = z.object({
  label: z.string().max(60).optional(),
  patientName: z.string().max(80).optional(),
  lensType: z.nativeEnum(LensType).nullable().optional(),
  prescribedOn: z.coerce.date().optional(),
  od: eye, os: eye,
  pdTotal: num, pdRight: num, pdLeft: num,
});

const d = (v: number | null | undefined) => (v == null ? null : new Prisma.Decimal(v));

async function withUrl<T extends { imageKey: string | null }>(p: T) {
  return { ...p, imageUrl: p.imageKey ? await signedUrl(p.imageKey) : null };
}

r.get('/', ah(async (req, res) => {
  const list = await prisma.prescription.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' } });
  res.json(await Promise.all(list.map(withUrl)));
}));

/** Dry-run validation so the app can show inline errors as the user types. */
r.post('/validate', validate(manualSchema), ah(async (req, res) => {
  const b = req.body as z.infer<typeof manualSchema>;
  res.json(validatePrescription(b, b.lensType ?? null));
}));

r.post('/manual', validate(manualSchema), ah(async (req, res) => {
  const b = req.body as z.infer<typeof manualSchema>;
  const v = validatePrescription(b, b.lensType ?? null);
  if (v.errors.length) throw badRequest('INVALID_PRESCRIPTION', 'Some prescription values need fixing', v);
  const n = v.normalized;
  const p = await prisma.prescription.create({
    data: {
      userId: req.user!.id, source: 'MANUAL', label: b.label ?? 'My prescription', patientName: b.patientName,
      prescribedOn: b.prescribedOn,
      odSph: d(n.od.sph), odCyl: d(n.od.cyl), odAxis: n.od.axis ?? null, odAdd: d(n.od.add), odNear: d(b.od.near),
      osSph: d(n.os.sph), osCyl: d(n.os.cyl), osAxis: n.os.axis ?? null, osAdd: d(n.os.add), osNear: d(b.os.near),
      pdTotal: d(n.pdTotal), pdRight: d(n.pdRight), pdLeft: d(n.pdLeft),
      isHighPower: v.isHighPower,
    },
  });
  res.status(201).json({ prescription: await withUrl(p), warnings: v.warnings });
}));

r.post('/upload', upload.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('NO_FILE', 'Attach a photo or PDF of your prescription');
  const key = await putPrivateFile(`prescriptions/${req.user!.id}`, req.file.buffer, req.file.mimetype);
  const p = await prisma.prescription.create({
    data: {
      userId: req.user!.id, source: 'UPLOAD', imageKey: key,
      label: typeof req.body.label === 'string' ? req.body.label.slice(0, 60) : 'Uploaded prescription',
      patientName: typeof req.body.patientName === 'string' ? req.body.patientName.slice(0, 80) : undefined,
    },
  });
  res.status(201).json({ prescription: await withUrl(p) });
}));

r.delete('/:id', ah(async (req, res) => {
  const p = await prisma.prescription.findFirst({ where: { id: req.params.id, userId: req.user!.id } });
  if (!p) throw notFound('Prescription');
  const used = await prisma.orderItem.count({ where: { prescriptionId: p.id } });
  if (used) throw badRequest('IN_USE', 'This prescription is linked to an order and cannot be deleted');
  await prisma.prescription.delete({ where: { id: p.id } });
  res.status(204).end();
}));

export default r;
