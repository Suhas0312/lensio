import { Coating, LensPackage, LensType } from '@prisma/client';
import { badRequest } from '../../lib/errors';
import { rxMaxPowers } from '../prescriptions/rx.rules';

export interface PriceLine {
  framePrice: number; lensPrice: number; coatingPrice: number; unitPrice: number;
}

/** Coating pairs that cannot be combined on one lens (photochromic + blue cut is its own option). */
const INCOMPATIBLE: [string, string][] = [['PHOTOCHROMIC', 'PHOTO_BLUE'], ['BLUE_CUT', 'PHOTO_BLUE'], ['PHOTOCHROMIC', 'POLARISED']];

const SUN_ONLY = /mirror|polari[sz]/i;                       // only makes sense on sunglasses
const NOT_FOR_SUN = /blue|photo|transition|night|drive/i;   // sunglass lenses are already tinted

/**
 * Which coatings a lens can take: every active coating the shop has (so imported coatings appear automatically),
 * except mirror/polarised on clear glasses and blue cut / photochromic / night drive on sunglasses.
 */
export function allowedCoatings(_lensType: LensType | null, isSunglasses: boolean, coatings: { code: string; name: string }[]): string[] {
  return coatings.filter((c) => {
    const k = `${c.code} ${c.name}`;
    return isSunglasses ? !NOT_FOR_SUN.test(k) : !SUN_ONLY.test(k);
  }).map((c) => c.code);
}

export function priceItem(args: {
  frameBase: number; variantDelta: number; isSunglasses: boolean;
  lens: LensPackage | null; coatings: Coating[]; requestedCodes: string[];
  rx?: { odSph?: unknown; osSph?: unknown; odCyl?: unknown; osCyl?: unknown } | null;
}): PriceLine {
  const { lens, coatings, requestedCodes } = args;
  const framePrice = args.frameBase + args.variantDelta;

  // Coatings: all requested must exist, be active and be allowed.
  const allowed = allowedCoatings(lens?.lensType ?? null, args.isSunglasses, coatings.filter((c) => c.isActive));
  const unique = [...new Set(requestedCodes)];
  for (const code of unique) {
    if (!allowed.includes(code)) throw badRequest('COATING_NOT_ALLOWED', `${code} is not available for this lens`);
    if (!coatings.find((c) => c.code === code && c.isActive)) throw badRequest('COATING_UNAVAILABLE', `${code} is unavailable`);
  }
  for (const [a, b] of INCOMPATIBLE) {
    if (unique.includes(a) && unique.includes(b)) throw badRequest('COATING_CONFLICT', `${a} and ${b} cannot be combined`);
  }
  if (!lens && unique.length && !args.isSunglasses) throw badRequest('LENS_REQUIRED', 'Pick a lens before adding coatings');

  // Lens must support the prescription power.
  if (lens && args.rx) {
    const { maxSph, maxCyl } = rxMaxPowers(args.rx);
    if (maxSph > Number(lens.maxAbsSph) || maxCyl > Number(lens.maxAbsCyl)) {
      throw badRequest('LENS_POWER_UNSUPPORTED',
        `${lens.name} supports up to ±${lens.maxAbsSph} SPH and ±${lens.maxAbsCyl} CYL. Choose a higher-index lens for your prescription.`);
    }
  }

  const lensPrice = lens?.price ?? 0;
  const coatingPrice = unique.reduce((s, code) => s + (coatings.find((c) => c.code === code)?.price ?? 0), 0);
  return { framePrice, lensPrice, coatingPrice, unitPrice: framePrice + lensPrice + coatingPrice };
}

export const lensNeedsRx = (t: LensType | null | undefined) => !!t && t !== 'ZERO_POWER';
