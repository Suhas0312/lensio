import { Resvg } from '@resvg/resvg-js';

/**
 * Pictures for lens types and coatings (lens choice screen), drawn like the frame pictures: no photos needed.
 * No text inside the images (the server has no fonts); labels are shown by the app.
 */
const W = 480, H = 320;
const LENS = 'M 70 70 Q 70 40 110 40 L 290 40 Q 330 40 330 75 L 326 215 Q 322 270 260 276 L 140 276 Q 76 272 72 215 Z'; // front view
const wrap = (defs: string, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${defs}</defs><rect width="${W}" height="${H}" rx="28" fill="#F4F5FB"/>${body}</svg>`;
const rim = `<path d="${LENS}" fill="none" stroke="#1B1F3B" stroke-width="7" stroke-linejoin="round"/>`;
const glare = `<path d="M 105 70 Q 140 58 175 62 L 120 160 Q 98 130 105 70 Z" fill="#fff" opacity=".45"/>`;
const lensWith = (fill: string, extra = '') => `<path d="${LENS}" fill="${fill}"/>${extra}${glare}${rim}`;
const sun = (x: number, y: number, r = 26, c = '#F5B301') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}"/>` +
  [...Array(8)].map((_, i) => { const a = (i * Math.PI) / 4; return `<line x1="${x + Math.cos(a) * (r + 8)}" y1="${y + Math.sin(a) * (r + 8)}" x2="${x + Math.cos(a) * (r + 20)}" y2="${y + Math.sin(a) * (r + 20)}" stroke="${c}" stroke-width="6" stroke-linecap="round"/>`; }).join('');
const blocked = (x1: number, y1: number, x2: number, y2: number, c: string) =>
  `<path d="M ${x1} ${y1} L ${(x1 + x2) / 2} ${y1 - 10} L ${x2} ${y2}" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><line x1="${x2 - 12}" y1="${y2 - 12}" x2="${x2 + 12}" y2="${y2 + 12}" stroke="#E11D48" stroke-width="7" stroke-linecap="round"/><line x1="${x2 + 12}" y1="${y2 - 12}" x2="${x2 - 12}" y2="${y2 + 12}" stroke="#E11D48" stroke-width="7" stroke-linecap="round"/>`;

/** Side profile: thinner edges for higher index (1.50 → 1.74). */
function profile(index: number, plus = false) {
  const t = Math.max(10, 46 - (index - 1.5) * 150); // edge thickness in px
  const x = 405, top = 60, bot = 270, c = plus ? 14 : 6;
  return plus
    ? `<path d="M ${x - c} ${top} Q ${x - t - 8} ${(top + bot) / 2} ${x - c} ${bot} L ${x + c} ${bot} Q ${x + t + 8} ${(top + bot) / 2} ${x + c} ${top} Z" fill="#CFE6FF" stroke="#1B1F3B" stroke-width="5"/>`
    : `<path d="M ${x - t / 2} ${top} Q ${x - 4} ${(top + bot) / 2} ${x - t / 2} ${bot} L ${x + t / 2} ${bot} Q ${x + 4} ${(top + bot) / 2} ${x + t / 2} ${top} Z" fill="#CFE6FF" stroke="#1B1F3B" stroke-width="5"/>`;
}

export function lensTypeSVG(lensType: string, index = 1.56, name = '') {
  const n = name.toLowerCase(), clear = '#E8F2FF';
  switch (lensType) {
    case 'PROGRESSIVE':
      return wrap('<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDE7FF"/><stop offset=".5" stop-color="#D9F5E5"/><stop offset="1" stop-color="#FFE9C7"/></linearGradient>',
        lensWith('url(#g)', `<path d="M 175 150 Q 200 165 225 150 L 238 270 L 162 270 Z" fill="#FFD9A0" opacity=".8"/><path d="M 190 120 L 210 120 L 222 160 L 178 160 Z" fill="#A7E3C0" opacity=".9"/>`) + profile(index));
    case 'BIFOCAL': {
      const seg = /kryptok|round/.test(n) ? '<circle cx="200" cy="225" r="38" fill="#FFE2B3" stroke="#B9824A" stroke-width="4"/>' : '<path d="M 150 205 L 250 205 Q 250 262 200 262 Q 150 262 150 205 Z" fill="#FFE2B3" stroke="#B9824A" stroke-width="4"/>';
      return wrap('', lensWith(clear, seg) + profile(index));
    }
    case 'SINGLE_VISION_READING':
      return wrap('', lensWith('#FFF4DF', '<rect x="150" y="190" width="100" height="56" rx="6" fill="#fff" stroke="#B9824A" stroke-width="4"/><line x1="200" y1="194" x2="200" y2="242" stroke="#B9824A" stroke-width="4"/>') + profile(index, true));
    case 'ZERO_POWER':
      return wrap('', lensWith(/poly/.test(n) || index >= 1.59 ? '#EAF7EE' : clear, /poly/.test(n) || index >= 1.59 ? '<path d="M 200 120 L 240 135 L 236 180 Q 230 210 200 222 Q 170 210 164 180 L 160 135 Z" fill="#34D399" opacity=".55"/>' : '') +
        '<rect x="400" y="60" width="12" height="210" rx="5" fill="#CFE6FF" stroke="#1B1F3B" stroke-width="5"/>');
    default: // single vision distance
      return wrap('', lensWith(/poly/.test(n) ? '#EAF7EE' : clear) + profile(index));
  }
}

export function coatingSVG(code: string, name: string) {
  const k = `${code} ${name}`.toLowerCase();
  const grad = (id: string, a: string, b: string, dir = 'x2="1" y2="1"') => `<linearGradient id="${id}" x1="0" y1="0" ${dir}><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
  if (/mirror/.test(k)) {
    const [a, b] = /blue/.test(k) ? ['#7FB3FF', '#1E40AF'] : /silver/.test(k) ? ['#F1F5F9', '#64748B'] : /green/.test(k) ? ['#86EFAC', '#166534'] : ['#FFE7A3', '#B8860B'];
    return wrap(grad('m', a, b), lensWith('url(#m)', `<path d="M 120 230 Q 220 120 320 80" stroke="#fff" stroke-width="10" opacity=".55" fill="none"/>`) + `<circle cx="410" cy="110" r="18" fill="${a}"/><circle cx="410" cy="160" r="18" fill="#C9D3E3"/><circle cx="410" cy="210" r="18" fill="#7FB3FF"/>`);
  }
  if (/polar/.test(k)) return wrap(grad('p', '#4B5563', '#1F2937', 'x2="0" y2="1"'),
    lensWith('url(#p)', [...Array(9)].map((_, i) => `<line x1="80" y1="${70 + i * 24}" x2="320" y2="${70 + i * 24}" stroke="#9CA3AF" stroke-width="2" opacity=".5"/>`).join('')) + sun(415, 70, 20) + blocked(415, 95, 330, 150, '#F5B301'));
  if (/photo/.test(k) && /blue/.test(k)) return wrap(grad('h', '#E8F2FF', '#4B5563'), lensWith('url(#h)') + sun(415, 70, 20) + blocked(430, 230, 335, 220, '#3B82F6'));
  if (/photo|transition/.test(k)) return wrap(grad('h', '#E8F2FF', '#374151'), lensWith('url(#h)') + sun(415, 160, 30));
  if (/blue/.test(k)) return wrap('', lensWith('#FFF7D6') + `<rect x="380" y="90" width="70" height="110" rx="10" fill="#1B1F3B"/><rect x="388" y="98" width="54" height="80" rx="4" fill="#60A5FA"/>` + blocked(380, 150, 330, 150, '#3B82F6'));
  if (/water|hydro|smudge|oleo/.test(k)) return wrap('', lensWith('#E8F2FF', [[150, 110, 18], [230, 150, 14], [180, 200, 22], [270, 95, 11], [255, 225, 16]].map(([x, y, r]) =>
    `<ellipse cx="${x}" cy="${y}" rx="${r}" ry="${r * 0.85}" fill="#93C5FD" opacity=".8"/><ellipse cx="${x - r / 3}" cy="${y - r / 3}" rx="${r / 3}" ry="${r / 4}" fill="#fff"/>`).join('')));
  if (/hard|scratch/.test(k)) return wrap('', lensWith('#E8F2FF', '<path d="M 200 95 L 255 115 L 250 175 Q 242 220 200 238 Q 158 220 150 175 L 145 115 Z" fill="#6366F1" opacity=".75"/><path d="M 175 165 L 195 185 L 230 145" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round"/>'));
  if (/uv/.test(k)) return wrap('', lensWith('#EEF2FF') + sun(415, 75, 22, '#A855F7') + blocked(415, 105, 330, 170, '#A855F7'));
  if (/tint|colour|color|gradient/.test(k)) return wrap(grad('t', '#8B5E3C', '#F3D9C4', 'x2="0" y2="1"'),
    lensWith('url(#t)') + ['#6B7280', '#8B5E3C', '#4D7C0F', '#2563EB', '#DB2777'].map((c, i) => `<circle cx="410" cy="${70 + i * 46}" r="16" fill="${c}"/>`).join(''));
  if (/drive|night|yellow/.test(k)) return wrap('', lensWith('#FDE68A') + '<circle cx="405" cy="120" r="22" fill="#FEF3C7" stroke="#F59E0B" stroke-width="5"/><circle cx="445" cy="120" r="22" fill="#FEF3C7" stroke="#F59E0B" stroke-width="5"/>' + blocked(400, 150, 330, 200, '#F59E0B'));
  if (/anti|arc|glare|reflect/.test(k)) return wrap(grad('a', '#86EFAC', '#A78BFA'), lensWith('#E8F2FF', '<path d="M 150 250 Q 230 170 300 90" stroke="url(#a)" stroke-width="16" opacity=".7" fill="none" stroke-linecap="round"/>') + sun(415, 75, 18) + '<line x1="390" y1="100" x2="300" y2="160" stroke="#F5B301" stroke-width="6" stroke-dasharray="10 8"/>');
  return wrap('', lensWith('#E8F2FF', '<path d="M 280 70 L 286 86 L 302 92 L 286 98 L 280 114 L 274 98 L 258 92 L 274 86 Z" fill="#FBBF24"/>'));
}

const cache = new Map<string, Buffer>();
export function lensArtPNG(key: string, svg: () => string) {
  let png = cache.get(key);
  if (!png) {
    png = new Resvg(svg(), { fitTo: { mode: 'width', value: 360 } }).render().asPng();
    if (cache.size > 300) cache.delete(cache.keys().next().value as string);
    cache.set(key, png);
  }
  return png;
}
