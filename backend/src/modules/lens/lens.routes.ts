import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { ah } from '../../lib/asyncHandler';
import { allowedCoatings } from './pricing';
import { LensType } from '@prisma/client';

const r = Router();

const TYPE_INFO: Record<LensType, { title: string; subtitle: string }> = {
  SINGLE_VISION_DISTANCE: { title: 'Single vision — distance', subtitle: 'For seeing far: driving, TV, walking' },
  SINGLE_VISION_READING: { title: 'Single vision — reading', subtitle: 'For close-up: books, phone' },
  BIFOCAL: { title: 'Bifocal', subtitle: 'Distance on top, reading below, with a visible line' },
  PROGRESSIVE: { title: 'Progressive', subtitle: 'Distance, computer and reading in one lens, no line' },
  ZERO_POWER: { title: 'Zero power', subtitle: 'No prescription. For screens or style' },
};

/** Full lens configurator options, grouped the way the app's step-by-step flow shows them. */
r.get('/options', ah(async (req, res) => {
  const isSunglasses = req.query.sunglasses === 'true';
  const [packages, coatings] = await Promise.all([
    prisma.lensPackage.findMany({ where: { isActive: true }, orderBy: [{ lensType: 'asc' }, { sortOrder: 'asc' }] }),
    prisma.coating.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
  ]);
  const types = (Object.keys(TYPE_INFO) as LensType[]).map((t) => ({
    lensType: t, ...TYPE_INFO[t],
    requiresPrescription: t !== 'ZERO_POWER',
    requiresAdd: t === 'BIFOCAL' || t === 'PROGRESSIVE',
    startingPrice: Math.min(...packages.filter((p) => p.lensType === t).map((p) => p.price), Infinity),
    packages: packages.filter((p) => p.lensType === t),
    allowedCoatings: allowedCoatings(t, isSunglasses, coatings),
  })).filter((t) => t.packages.length);
  res.json({ types, coatings });
}));

export default r;
