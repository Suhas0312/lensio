import { describe, expect, it } from 'vitest';
import { parseCaption } from './caption';

describe('parseCaption', () => {
  it('reads name, price and MRP from a typical post', () => {
    const g = parseCaption('✨ Classic Round Metal Frame ✨\nPrice: ₹1,299 (MRP ₹2,499)\nFor men & women #eyewear #roundglasses');
    expect(g).toMatchObject({ name: 'Classic Round Metal Frame', price: 1299, mrp: 2499, shape: 'ROUND', gender: 'UNISEX', sunglasses: false });
  });
  it('detects polarized sunglasses and aviator shape', () => {
    const g = parseCaption('Ray-Ban style Aviator Polarized Sunglasses 😎\nOnly Rs. 999/-\nDM to order #sunglasses');
    expect(g).toMatchObject({ price: 999, shape: 'AVIATOR', sunglasses: true, polarized: true });
    expect(g.name).toMatch(/Aviator Polarized Sunglasses/);
  });
  it('detects women and kids', () => {
    expect(parseCaption('Cat eye frame for women ₹1499').gender).toBe('WOMEN');
    expect(parseCaption('Pixel kids frames ₹799').gender).toBe('KIDS');
    expect(parseCaption('Square frame for men ₹1199').gender).toBe('MEN');
  });
  it('skips price and contact lines when picking the name', () => {
    const g = parseCaption('₹899 only!!\nCall 9876543210\nBlue Cut Computer Glasses\n#bluecut');
    expect(g.name).toBe('Blue Cut Computer Glasses');
    expect(g.price).toBe(899);
  });
  it('copes with empty captions', () => {
    expect(parseCaption(null)).toMatchObject({ name: 'New frame', price: null, mrp: null, shape: 'RECTANGLE' });
  });
});
