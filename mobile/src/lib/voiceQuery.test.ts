// Run with: npx tsx src/lib/voiceQuery.test.ts
import { parseVoiceQuery as p } from './voiceQuery';
const cases: [string, object][] = [
  ["women's black cat eye frames under 2000", { gender: 'WOMEN', shape: 'CAT_EYE', maxPrice: 200000, q: 'black' }],
  ['show me round glasses below ₹1,500', { shape: 'ROUND', maxPrice: 150000, q: '' }],
  ['aviator sunglasses for men', { shape: 'AVIATOR', sunglasses: true, gender: 'MEN', q: '' }],
  ['cheap kids frames', { gender: 'KIDS', sort: 'price_asc', q: '' }],
  ['blue wide rectangle between 1000 and 3k', { shape: 'RECTANGLE', size: 'WIDE', minPrice: 100000, maxPrice: 300000, q: 'blue' }],
  ['Vista', { q: 'vista' }],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = p(input) as unknown as Record<string, unknown>;
  const bad = Object.entries(want).filter(([k, v]) => got[k] !== v);
  if (bad.length) { fail++; console.log('FAIL', JSON.stringify(input), 'got', JSON.stringify(got)); } else console.log('ok  ', input);
}
process.exit(fail ? 1 : 0);
