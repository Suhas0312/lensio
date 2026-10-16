import { describe, expect, it } from 'vitest';
import { allowedCoatings } from './pricing';

const all = [['ARC', 'Anti-reflective'], ['BLUE_CUT', 'Blue cut'], ['HYDROPHOBIC', 'Water & smudge repellent'], ['PHOTOCHROMIC', 'Photochromic'], ['PHOTO_BLUE', 'Photochromic + blue cut'],
  ['HARD_COAT', 'Scratch-resistant hard coat'], ['UV400', 'UV400 protection'], ['POLARISED', 'Polarised (sunglasses)'], ['TINT', 'Colour tint'], ['MIRROR', 'Mirror coat'], ['DRIVE', 'Night drive'], ['GOLD_MIRROR', 'Gold mirror (new)']]
  .map(([code, name]) => ({ code, name }));

describe('which coatings each lens can take', () => {
  it('eyeglasses: every imported coating except mirror and polarised', () => {
    expect(allowedCoatings('SINGLE_VISION_DISTANCE', false, all)).toEqual(['ARC', 'BLUE_CUT', 'HYDROPHOBIC', 'PHOTOCHROMIC', 'PHOTO_BLUE', 'HARD_COAT', 'UV400', 'TINT', 'DRIVE']);
  });
  it('sunglasses: polarised, mirror (incl. new ones), tint, UV… but no blue cut, photochromic or night drive', () => {
    expect(allowedCoatings(null, true, all)).toEqual(['ARC', 'HYDROPHOBIC', 'HARD_COAT', 'UV400', 'POLARISED', 'TINT', 'MIRROR', 'GOLD_MIRROR']);
  });
});
