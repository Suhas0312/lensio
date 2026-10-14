import { LensType } from '@prisma/client';

/**
 * Clinical input rules for spectacle prescriptions.
 * Ranges reflect what standard Indian optical labs can surface;
 * anything outside is rejected, anything "high power" is flagged for manual review.
 */
export const RX_LIMITS = {
  sph: { min: -20, max: 20, step: 0.25 },
  cyl: { min: -6, max: 6, step: 0.25 },
  axis: { min: 1, max: 180 },
  add: { min: 0.75, max: 3.5, step: 0.25 },
  pdTotal: { min: 50, max: 80 },
  pdMono: { min: 24, max: 40 },
  highPowerSph: 6,
  highPowerCyl: 2,
  anisometropiaWarn: 3, // diopter difference between eyes
} as const;

/** `near` = the SPH on the prescription's near-vision (N.V. / reading) row. When ADD is blank, ADD = near − distance SPH. */
export interface EyeInput { sph?: number | null; cyl?: number | null; axis?: number | null; add?: number | null; near?: number | null }
export interface RxInput {
  od: EyeInput; os: EyeInput;
  pdTotal?: number | null; pdRight?: number | null; pdLeft?: number | null;
}
export interface RxIssue { field: string; message: string }
export interface RxResult { errors: RxIssue[]; warnings: RxIssue[]; isHighPower: boolean; normalized: RxInput }

const onStep = (v: number, step: number) => Math.abs(Math.round(v / step) * step - v) < 1e-6;
const round2 = (v: number) => Math.round(v * 100) / 100;

function checkEye(eye: 'od' | 'os', input: EyeInput, needsAdd: boolean, errors: RxIssue[], warnings: RxIssue[] = []): EyeInput {
  const label = eye === 'od' ? 'Right eye' : 'Left eye';
  const e: EyeInput = { ...input };

  // Near-vision row: validate it, and use it to work out ADD when ADD wasn't typed.
  if (e.near != null) {
    if (e.near < RX_LIMITS.sph.min || e.near > RX_LIMITS.sph.max || !onStep(e.near, RX_LIMITS.sph.step))
      errors.push({ field: `${eye}.near`, message: `${label}: near-vision SPH must be −20 to +20 in 0.25 steps` });
    else if (e.sph != null) {
      const derived = round2(e.near - e.sph);
      if (e.add == null) e.add = derived;
      else if (Math.abs(e.add - derived) > 0.001)
        warnings.push({ field: `${eye}.add`, message: `${label}: ADD (${e.add}) doesn't match near − distance SPH (${derived}). Please double-check.` });
    }
  }
  const out: EyeInput = { ...e };
  const L = RX_LIMITS;

  if (e.sph == null) errors.push({ field: `${eye}.sph`, message: `${label}: enter SPH (use 0.00 for plano)` });
  else if (e.sph < L.sph.min || e.sph > L.sph.max) errors.push({ field: `${eye}.sph`, message: `${label}: SPH must be between ${L.sph.min} and +${L.sph.max}` });
  else if (!onStep(e.sph, L.sph.step)) errors.push({ field: `${eye}.sph`, message: `${label}: SPH goes in 0.25 steps` });

  const cyl = e.cyl ?? 0;
  if (cyl < L.cyl.min || cyl > L.cyl.max) errors.push({ field: `${eye}.cyl`, message: `${label}: CYL must be between ${L.cyl.min} and +${L.cyl.max}` });
  else if (!onStep(cyl, L.cyl.step)) errors.push({ field: `${eye}.cyl`, message: `${label}: CYL goes in 0.25 steps` });

  if (cyl !== 0) {
    if (e.axis == null) errors.push({ field: `${eye}.axis`, message: `${label}: AXIS is required when CYL is not zero` });
    else if (!Number.isInteger(e.axis) || e.axis < L.axis.min || e.axis > L.axis.max)
      errors.push({ field: `${eye}.axis`, message: `${label}: AXIS must be a whole number from 1 to 180` });
  } else {
    out.axis = null; // axis is meaningless without cylinder
  }

  if (needsAdd) {
    if (e.add == null) errors.push({ field: `${eye}.add`, message: `${label}: ADD is required for bifocal and progressive lenses` });
    else if (e.add < L.add.min || e.add > L.add.max || !onStep(e.add, L.add.step))
      errors.push({ field: `${eye}.add`, message: `${label}: ADD must be +0.75 to +3.50 in 0.25 steps` });
  } else if (e.add != null) {
    // Optional for single vision, but if it's there it must be a real ADD value.
    if (e.add < L.add.min || e.add > L.add.max || !onStep(e.add, L.add.step))
      errors.push({ field: `${eye}.add`, message: `${label}: ADD must be +0.75 to +3.50 in 0.25 steps${input.add == null && e.near != null ? ' (worked out from your near-vision SPH)' : ''}` });
    out.add = e.add;
  } else {
    out.add = null;
  }

  /**
   * Transpose plus-cylinder to minus-cylinder form (lab convention).
   * sph' = sph + cyl, cyl' = -cyl, axis' = axis ± 90.
   */
  if (e.sph != null && cyl > 0 && e.axis != null) {
    out.sph = round2(e.sph + cyl);
    out.cyl = round2(-cyl);
    out.axis = e.axis > 90 ? e.axis - 90 : e.axis + 90;
  } else {
    out.cyl = cyl;
  }
  return out;
}

export function validatePrescription(rx: RxInput, lensType: LensType | null): RxResult {
  const errors: RxIssue[] = [];
  const warnings: RxIssue[] = [];
  const needsAdd = lensType === 'BIFOCAL' || lensType === 'PROGRESSIVE';

  const od = checkEye('od', rx.od, needsAdd, errors, warnings);
  const os = checkEye('os', rx.os, needsAdd, errors, warnings);

  const L = RX_LIMITS;
  const hasMono = rx.pdRight != null || rx.pdLeft != null;
  if (hasMono) {
    for (const [f, v] of [['pdRight', rx.pdRight], ['pdLeft', rx.pdLeft]] as const) {
      if (v == null || v < L.pdMono.min || v > L.pdMono.max)
        errors.push({ field: f, message: `Monocular PD must be ${L.pdMono.min}–${L.pdMono.max} mm for each eye` });
    }
  } else if (rx.pdTotal == null) {
    errors.push({ field: 'pdTotal', message: 'Enter your pupillary distance (PD). Most adults are between 58 and 68 mm.' });
  } else if (rx.pdTotal < L.pdTotal.min || rx.pdTotal > L.pdTotal.max) {
    errors.push({ field: 'pdTotal', message: `PD must be ${L.pdTotal.min}–${L.pdTotal.max} mm` });
  }

  const absMax = (a?: number | null, b?: number | null) => Math.max(Math.abs(a ?? 0), Math.abs(b ?? 0));
  const isHighPower = absMax(od.sph, os.sph) > L.highPowerSph || absMax(od.cyl, os.cyl) > L.highPowerCyl;
  if (isHighPower) warnings.push({ field: 'rx', message: 'High power: our optician will verify this before lens cutting, and a thinner high-index lens is recommended.' });

  if (od.sph != null && os.sph != null && Math.abs(od.sph - os.sph) >= L.anisometropiaWarn)
    warnings.push({ field: 'rx', message: 'The power differs a lot between your eyes. Double-check the values against your prescription.' });

  if (lensType === 'ZERO_POWER') {
    const allZero = [od.sph, od.cyl, os.sph, os.cyl].every((v) => (v ?? 0) === 0);
    if (!allZero) errors.push({ field: 'lensType', message: 'Zero power lenses cannot carry a prescription. Pick single vision instead.' });
  }

  return {
    errors, warnings, isHighPower,
    normalized: { od, os, pdTotal: hasMono ? round2((rx.pdRight ?? 0) + (rx.pdLeft ?? 0)) : rx.pdTotal, pdRight: rx.pdRight ?? null, pdLeft: rx.pdLeft ?? null },
  };
}

/** Highest absolute sphere/cylinder in a prescription, used to check lens package compatibility. */
export function rxMaxPowers(p: { odSph?: unknown; osSph?: unknown; odCyl?: unknown; osCyl?: unknown }) {
  const n = (v: unknown) => Math.abs(Number(v ?? 0));
  return { maxSph: Math.max(n(p.odSph), n(p.osSph)), maxCyl: Math.max(n(p.odCyl), n(p.osCyl)) };
}
