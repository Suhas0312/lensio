import { describe, expect, it } from 'vitest';
import { validatePrescription } from './rx.rules';

const ok = { od: { sph: -1.25, cyl: -0.5, axis: 180 }, os: { sph: -1.5, cyl: 0 }, pdTotal: 63 };

describe('validatePrescription', () => {
  it('accepts a normal single vision prescription', () => {
    const r = validatePrescription(ok, 'SINGLE_VISION_DISTANCE');
    expect(r.errors).toHaveLength(0);
    expect(r.isHighPower).toBe(false);
  });
  it('requires axis when cyl is set', () => {
    const r = validatePrescription({ ...ok, od: { sph: -1, cyl: -1 } }, 'SINGLE_VISION_DISTANCE');
    expect(r.errors.map((e) => e.field)).toContain('od.axis');
  });
  it('rejects off-step values', () => {
    const r = validatePrescription({ ...ok, od: { sph: -1.3, cyl: 0 } }, 'SINGLE_VISION_DISTANCE');
    expect(r.errors[0].field).toBe('od.sph');
  });
  it('requires ADD for progressive', () => {
    const r = validatePrescription(ok, 'PROGRESSIVE');
    expect(r.errors.some((e) => e.field.endsWith('.add'))).toBe(true);
  });
  it('flags high cylinder as high power', () => {
    const r = validatePrescription({ ...ok, od: { sph: -2, cyl: -2.75, axis: 90 } }, 'SINGLE_VISION_DISTANCE');
    expect(r.isHighPower).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('transposes plus cylinder to minus cylinder', () => {
    const r = validatePrescription({ ...ok, od: { sph: -1, cyl: 1, axis: 30 } }, 'SINGLE_VISION_DISTANCE');
    expect(r.normalized.od).toMatchObject({ sph: 0, cyl: -1, axis: 120 });
  });
  it('rejects power on zero-power lenses', () => {
    const r = validatePrescription(ok, 'ZERO_POWER');
    expect(r.errors.some((e) => e.field === 'lensType')).toBe(true);
  });
  it('sums monocular PD', () => {
    const r = validatePrescription({ ...ok, pdTotal: null, pdRight: 31.5, pdLeft: 32 }, 'SINGLE_VISION_DISTANCE');
    expect(r.errors).toHaveLength(0);
    expect(r.normalized.pdTotal).toBe(63.5);
  });
});

describe('near vision and ADD', () => {
  const base = { pdTotal: 63 };
  it('works out ADD from the near-vision row', () => {
    const r = validatePrescription({ ...base, od: { sph: -1, near: 1 }, os: { sph: -1.5, near: 0.5 } }, 'PROGRESSIVE');
    expect(r.errors).toHaveLength(0);
    expect(r.normalized.od.add).toBe(2);
    expect(r.normalized.os.add).toBe(2);
  });
  it('accepts ADD on single vision too, but checks it', () => {
    expect(validatePrescription({ ...base, od: { sph: -1, add: 1.5 }, os: { sph: -1 } }, 'SINGLE_VISION_DISTANCE').errors).toHaveLength(0);
    expect(validatePrescription({ ...base, od: { sph: -1, add: 5 }, os: { sph: -1 } }, null).errors[0].field).toBe('od.add');
  });
  it('warns when typed ADD and near row disagree', () => {
    const r = validatePrescription({ ...base, od: { sph: -1, add: 1.5, near: 1 }, os: { sph: -1 } }, 'BIFOCAL');
    expect(r.warnings.some((w) => w.field === 'od.add')).toBe(true);
  });
  it('rejects an impossible near row', () => {
    const r = validatePrescription({ ...base, od: { sph: -1, near: 1.3 }, os: { sph: -1 } }, null);
    expect(r.errors[0].field).toBe('od.near');
  });
});
