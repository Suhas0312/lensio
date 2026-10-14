/**
 * Turns a spoken search into shop filters, e.g.
 * "women's black cat eye frames under 2000" → { gender: WOMEN, shape: CAT_EYE, maxPrice: 200000, q: 'black' }
 */
export interface VoiceFilters { q: string; shape?: string; size?: string; gender?: string; sunglasses?: boolean; maxPrice?: number; minPrice?: number; sort?: string }

const SHAPES: [RegExp, string][] = [
  [/\bcat[\s-]?eye\b/, 'CAT_EYE'], [/\baviators?\b|\bpilot\b/, 'AVIATOR'], [/\bway ?farers?\b/, 'WAYFARER'],
  [/\brectang(le|ular)\b/, 'RECTANGLE'], [/\bround\b|\bcircle\b/, 'ROUND'], [/\bsquare\b/, 'SQUARE'],
  [/\boval\b/, 'OVAL'], [/\bgeometric\b|\bhexagon(al)?\b/, 'GEOMETRIC'],
];
const num = (s: string) => Number(s.replace(/[,\s]/g, '').replace(/k$/i, '000'));

export function parseVoiceQuery(raw: string): VoiceFilters {
  let t = ` ${raw.toLowerCase().replace(/₹|rs\.?|rupees?|inr/g, ' ').replace(/\s+/g, ' ')} `;
  const f: VoiceFilters = { q: '' };
  const take = (re: RegExp) => { t = t.replace(re, ' '); };

  for (const [re, shape] of SHAPES) if (re.test(t)) { f.shape = shape; take(re); break; }
  if (/\bsun ?glass(es)?\b|\bshades\b/.test(t)) { f.sunglasses = true; take(/\bsun ?glass(es)?\b|\bshades\b/g); }
  if (/\b(women|woman|ladies|lady|girls?|female)('?s)?\b/.test(t)) { f.gender = 'WOMEN'; take(/\b(women|woman|ladies|lady|girls?|female)('?s)?\b/g); }
  else if (/\b(men|man|gents|boys?|male)('?s)?\b/.test(t)) { f.gender = 'MEN'; take(/\b(men|man|gents|boys?|male)('?s)?\b/g); }
  else if (/\b(kids?|child(ren)?)('?s)?\b/.test(t)) { f.gender = 'KIDS'; take(/\b(kids?|child(ren)?)('?s)?\b/g); }
  if (/\b(small|narrow)\b/.test(t)) { f.size = 'SMALL'; take(/\b(small|narrow)\b/g); }
  else if (/\b(wide|large|big)\b/.test(t)) { f.size = 'WIDE'; take(/\b(wide|large|big)\b/g); }
  else if (/\bmedium\b/.test(t)) { f.size = 'MEDIUM'; take(/\bmedium\b/g); }

  const between = t.match(/\bbetween (\d[\d,]*k?) (?:and|to) (\d[\d,]*k?)\b/);
  const under = t.match(/\b(?:under|below|less than|within|upto|up to|max(?:imum)?)\s+(\d[\d,]*k?)\b/);
  const over = t.match(/\b(?:over|above|more than|min(?:imum)?)\s+(\d[\d,]*k?)\b/);
  if (between) { f.minPrice = num(between[1]) * 100; f.maxPrice = num(between[2]) * 100; t = t.replace(between[0], ' '); }
  if (under) { f.maxPrice = num(under[1]) * 100; t = t.replace(under[0], ' '); }
  if (over) { f.minPrice = num(over[1]) * 100; t = t.replace(over[0], ' '); }
  if (/\b(cheap(est)?|budget|low price|affordable)\b/.test(t)) { f.sort = 'price_asc'; take(/\b(cheap(est)?|budget|low price|affordable)\b/g); }
  else if (/\b(premium|expensive|luxury)\b/.test(t)) { f.sort = 'price_desc'; take(/\b(premium|expensive|luxury)\b/g); }
  else if (/\b(new(est)?|latest)\b/.test(t)) { f.sort = 'new'; take(/\b(new(est)?|latest)\b/g); }

  // Drop filler words; whatever is left (e.g. a colour or brand) becomes the text search.
  f.q = t.replace(/\b(show|me|find|search|for|i|want|need|looking|some|a|an|the|with|and|in|of|please|frames?|glasses|eye ?glasses|spectacles|specs|eyewear|pairs?|colou?r(ed)?|shape(d)?|style)\b/g, ' ')
    .replace(/'s\b/g, ' ').replace(/[^a-z0-9 -]/g, ' ').replace(/\s+/g, ' ').trim();
  return f;
}
