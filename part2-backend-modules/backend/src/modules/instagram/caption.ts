/**
 * Reads product details out of an Instagram caption, e.g.
 *   "✨ Classic Round Metal Frame ✨\nPrice: ₹1,299 (MRP ₹2,499)\nFor men & women #eyewear #roundglasses"
 * Everything is a best guess; the admin reviews it before importing.
 */
export interface CaptionGuess {
  name: string; price: number | null; mrp: number | null;           // rupees
  shape: string; gender: string; sunglasses: boolean; polarized: boolean;
}

const SHAPES: [RegExp, string][] = [
  [/cat[\s-]?eye/i, 'CAT_EYE'], [/aviator|pilot/i, 'AVIATOR'], [/way ?farer/i, 'WAYFARER'], [/rectang/i, 'RECTANGLE'],
  [/\bround\b|circle/i, 'ROUND'], [/square/i, 'SQUARE'], [/\boval\b/i, 'OVAL'], [/geometric|hexagon|octagon/i, 'GEOMETRIC'],
];
const num = (s: string) => Number(s.replace(/[,\s]/g, ''));
const clean = (s: string) => s.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/[*_~|•·✨⭐️]+/g, ' ').replace(/\s+/g, ' ').trim();

export function parseCaption(caption: string | null | undefined): CaptionGuess {
  const text = caption ?? '';
  const noTags = text.replace(/#[\p{L}\p{N}_]+/gu, ' ');
  const low = text.toLowerCase();

  // Prices: "MRP 2,499", "₹1,299", "Rs. 999", "price 1299/-", "offer price ₹899"
  const mrpM = noTags.match(/\bmrp\s*[:\-]?\s*(?:₹|rs\.?|inr)?\s*(\d[\d,]*)/i);
  const mrp = mrpM ? num(mrpM[1]) : null;
  const amounts = [...noTags.matchAll(/(?:₹|rs\.?\s*|inr\s*|price\s*[:\-]?\s*(?:₹|rs\.?)?\s*)(\d[\d,]{1,6})(?:\s*\/-)?/gi)].map((m) => num(m[1])).filter((n) => n >= 50 && n <= 200000);
  let price: number | null = null;
  const cand = amounts.filter((n) => n !== mrp);
  if (cand.length) price = Math.min(...cand);
  else if (amounts.length) price = amounts[0];
  if (price && mrp && mrp < price) price = mrp;

  // Name: first meaningful line without prices/links/hashtags
  const lines = text.split(/\n+/).map((l) => clean(l.replace(/#[\p{L}\p{N}_]+/gu, '').replace(/https?:\/\/\S+/g, ''))).filter(Boolean);
  const nameLine = lines.find((l) => l.length >= 3 && !/(₹|rs\.?\s*\d|mrp|price|dm |whatsapp|call|order now|link in bio|\d{10})/i.test(l)) ?? '';
  const name = nameLine.replace(/^(new( arrival)?s?|introducing|presenting)\s*[:\-]?\s*/i, '').split(/[.!?]/)[0].slice(0, 60).trim();

  const shape = SHAPES.find(([re]) => re.test(low))?.[1] ?? 'RECTANGLE';
  const sunglasses = /sun ?glass|shades|polari[sz]ed|uv ?400/i.test(low);
  const polarized = /polari[sz]ed/i.test(low);
  const gender = /\b(kids?|children|junior)\b/i.test(low) ? 'KIDS'
    : /\b(women|woman|ladies|her)\b/i.test(low) && !/\b(men|unisex|both)\b/i.test(low.replace(/women/g, '')) ? 'WOMEN'
    : /\b(men|man|gents|him)\b/i.test(low.replace(/women/g, '')) && !/\b(women|unisex|both)\b/i.test(low) ? 'MEN' : 'UNISEX';
  return { name: name || 'New frame', price, mrp: mrp && price && mrp > price ? mrp : null, shape, gender, sunglasses, polarized };
}
