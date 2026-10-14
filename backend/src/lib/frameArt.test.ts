import { describe, expect, it } from 'vitest';
import { framePNG, swapPlaceholderImages } from './frameArt';

const spec = { shape: 'CAT_EYE', material: 'ACETATE', isSunglasses: false, lensWidthMm: 52, bridgeMm: 18, frameWidthMm: 138 };

describe('frame art', () => {
  it('renders a transparent PNG for every shape', () => {
    for (const shape of ['RECTANGLE', 'ROUND', 'CAT_EYE', 'AVIATOR', 'WAYFARER', 'SQUARE', 'OVAL', 'GEOMETRIC']) {
      const png = framePNG('p' + shape, new Date(0), { ...spec, shape }, '#7A2E3A', false);
      expect(png.subarray(1, 4).toString()).toBe('PNG');
    }
  });
  it('swaps only text placeholders, keeps real photos', () => {
    const body = { items: [
      { id: 'a', shape: 'ROUND', images: [{ url: 'https://placehold.co/800x600/F4F5FB/1B1F3B/png?text=Orbit' }], variants: [{ colorHex: '#B89B5E' }] },
      { id: 'b', shape: 'ROUND', images: [{ url: 'https://cdn.example.com/real.jpg' }] },
      { id: 'c', shape: 'ROUND', images: [] },
    ] };
    swapPlaceholderImages(body, 'https://api.test');
    expect(body.items[0].images[0].url).toBe('https://api.test/v1/catalog/products/a/frame.png?c=B89B5E&pad=1');
    expect(body.items[1].images[0].url).toBe('https://cdn.example.com/real.jpg');
    expect(body.items[2].images).toHaveLength(1);
  });
});
