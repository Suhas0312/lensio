import { Resvg } from '@resvg/resvg-js';

/**
 * Drawn frame pictures (Lenskart-style) for frames that have no real photo yet.
 * One source for the shop, product page, cart, orders, admin and the try-on overlay.
 */
export interface FrameSpec {
  shape: string; material: string; isSunglasses: boolean;
  lensWidthMm: number; bridgeMm: number; frameWidthMm: number;
}

/** Sample frames use text placeholders such as placehold.co/…?text=Name — never show those. */
export const PLACEHOLDER_IMAGE = /placehold\.co|placeholder|dummyimage|via\.placeholder/i;

const n1 = (v: number) => v.toFixed(1);
const P = (pts: number[][]) => pts.map((p) => p.map(n1).join(' ')).join(' ');

function shade(hex: string, amt: number) {
  const n = parseInt(hex.replace('#', '').padEnd(6, '0').slice(0, 6), 16) || 0;
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) + 255 * amt)));
  return '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0');
}

/** One lens outline centred on 0,0 with the nose side towards -x. a = half width. Returns [path, half height]. */
function lensPath(shape: string, a: number): [string, number] {
  let b: number;
  switch (shape) {
    case 'ROUND': b = a * 0.93; return [`M ${-a} 0 A ${a} ${b} 0 1 1 ${a} 0 A ${a} ${b} 0 1 1 ${-a} 0 Z`, b];
    case 'OVAL': b = a * 0.7; return [`M ${-a} 0 A ${a} ${b} 0 1 1 ${a} 0 A ${a} ${b} 0 1 1 ${-a} 0 Z`, b];
    case 'RECTANGLE': case 'SQUARE': {
      b = a * (shape === 'SQUARE' ? 0.84 : 0.58); const r = a * (shape === 'SQUARE' ? 0.26 : 0.22);
      return [`M ${-a + r} ${-b} H ${a - r} Q ${a} ${-b} ${a} ${-b + r} V ${b - r} Q ${a} ${b} ${a - r} ${b} H ${-a + r} Q ${-a} ${b} ${-a} ${b - r} V ${-b + r} Q ${-a} ${-b} ${-a + r} ${-b} Z`, b];
    }
    case 'WAYFARER': b = a * 0.72;
      return [`M ${P([[-a * 0.98, -b * 0.92]])} C ${P([[-a * 0.4, -b * 1.08], [a * 0.5, -b * 1.12], [a * 1.06, -b * 1.02]])} C ${P([[a * 1.04, -b * 0.2], [a * 0.92, b * 0.9], [a * 0.55, b]])} C ${P([[0, b * 1.06], [-a * 0.7, b * 1.02], [-a * 0.9, b * 0.7]])} C ${P([[-a * 1.02, b * 0.2], [-a * 1.04, -b * 0.6], [-a * 0.98, -b * 0.92]])} Z`, b * 1.12];
    case 'CAT_EYE': b = a * 0.64;
      return [`M ${P([[-a * 0.95, -b * 0.62]])} C ${P([[-a * 0.4, -b * 1.02], [a * 0.5, -b * 1.15], [a * 1.12, -b * 1.42]])} C ${P([[a * 1.08, -b * 0.4], [a * 0.9, b * 0.85], [a * 0.35, b]])} C ${P([[-a * 0.2, b * 1.08], [-a * 0.85, b * 0.95], [-a * 0.98, b * 0.35]])} C ${P([[-a * 1.03, -b * 0.05], [-a * 1.02, -b * 0.4], [-a * 0.95, -b * 0.62]])} Z`, b * 1.42];
    case 'AVIATOR': b = a * 0.8;
      return [`M ${P([[a * 0.95, -b * 0.82]])} C ${P([[a * 0.3, -b * 1.02], [-a * 0.6, -b * 1.02], [-a * 1.02, -b * 0.85]])} C ${P([[-a * 1.12, -b * 0.2], [-a * 0.82, b * 0.95], [-a * 0.15, b * 1.08]])} C ${P([[a * 0.55, b * 1.12], [a * 0.98, b * 0.55], [a * 1.0, -b * 0.05]])} C ${P([[a * 1.0, -b * 0.45], [a * 0.98, -b * 0.7], [a * 0.95, -b * 0.82]])} Z`, b * 1.12];
    case 'GEOMETRIC': default: b = a * 0.8;
      return [`M ${P([[-a * 0.5, -b]])} L ${P([[a * 0.5, -b]])} L ${P([[a, -b * 0.15]])} L ${P([[a * 0.62, b]])} L ${P([[-a * 0.62, b]])} L ${P([[-a, -b * 0.15]])} Z`, b];
  }
}

/** Front view of the frame. The picture is exactly the frame's total width, centred on the lens centres (try-on relies on this). */
export function frameSVG(f: FrameSpec, hex: string, padded = false) {
  const lw = (f.lensWidthMm || 52) * 10, br = (f.bridgeMm || 18) * 10, a = lw / 2;
  const metal = f.material === 'METAL' || f.material === 'TITANIUM';
  const rim = metal ? 13 : f.material === 'TR90' ? 26 : 32;
  const [path, hh] = lensPath(f.shape, a);
  const cx = br / 2 + a;
  const half = Math.max((f.frameWidthMm || 138) * 5, cx + a + rim + 30);
  const H = Math.ceil(hh + rim + 20);
  const dark = shade(hex, -0.22), light = shade(hex, 0.35);
  const lensFill = f.isSunglasses ? 'url(#tint)' : 'url(#clear)';
  const lens = (sx: number) => `<g transform="translate(${sx * cx} 0) scale(${sx} 1)">
      <path d="${path}" fill="${lensFill}"/><path d="${path}" fill="url(#glare)"/>
      <path d="${path}" fill="none" stroke="url(#rim)" stroke-width="${rim}" stroke-linejoin="round"/>
      ${metal ? '' : `<path d="${path}" fill="none" stroke="${light}" stroke-opacity=".35" stroke-width="${Math.max(3, rim * 0.18)}" transform="translate(0 ${-rim * 0.18})"/>`}
    </g>`;
  const top = -hh * 0.55, edge = cx + a;
  const hinge = (sx: number) => `<path d="M ${sx * (edge - rim * 0.3)} ${top - rim * 0.55} L ${sx * half} ${top - rim * 0.35} L ${sx * half} ${top + rim * 0.65} L ${sx * (edge - rim * 0.3)} ${top + rim * 0.85} Z" fill="url(#rim)"/>`;
  const bridgeY = f.shape === 'AVIATOR' ? -hh * 0.62 : -hh * 0.35;
  const bridge = metal
    ? `<path d="M ${-br / 2 - 6} ${bridgeY} Q 0 ${bridgeY - br * 0.32} ${br / 2 + 6} ${bridgeY}" fill="none" stroke="url(#rim)" stroke-width="${rim}" stroke-linecap="round"/>
       ${f.shape === 'AVIATOR' ? `<path d="M ${-br / 2 - a * 0.35} ${-hh * 0.8} Q 0 ${-hh * 0.86} ${br / 2 + a * 0.35} ${-hh * 0.8}" fill="none" stroke="url(#rim)" stroke-width="${rim * 0.9}" stroke-linecap="round"/>` : ''}
       <ellipse cx="${-br * 0.42}" cy="${hh * 0.12}" rx="${br * 0.12}" ry="${br * 0.2}" fill="#fff" fill-opacity=".35" stroke="${dark}" stroke-width="3"/>
       <ellipse cx="${br * 0.42}" cy="${hh * 0.12}" rx="${br * 0.12}" ry="${br * 0.2}" fill="#fff" fill-opacity=".35" stroke="${dark}" stroke-width="3"/>`
    : `<path d="M ${-br / 2 - rim} ${bridgeY - rim * 0.5} Q 0 ${bridgeY - br * 0.38 - rim * 0.5} ${br / 2 + rim} ${bridgeY - rim * 0.5} L ${br / 2 + rim} ${bridgeY + rim * 0.6} Q 0 ${bridgeY - br * 0.38 + rim * 0.9} ${-br / 2 - rim} ${bridgeY + rim * 0.6} Z" fill="url(#rim)"/>`;
  // Shop pictures get breathing room (4:3 like product photos); try-on overlays must stay tight.
  const vw = half * 2, vh = H * 2;
  const box = padded ? (() => { const w = vw * 1.18, h = Math.max(vh * 1.3, w * 0.75); return [-w / 2, -h / 2, w, h]; })() : [-half, -H, vw, vh];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(n1).join(' ')}" width="${n1(box[2])}" height="${n1(box[3])}">
    <defs>
      <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${hex}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <linearGradient id="clear" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset="1" stop-color="#cfe6ff" stop-opacity=".06"/></linearGradient>
      <linearGradient id="tint" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(hex, -0.55)}" stop-opacity=".92"/><stop offset="1" stop-color="${shade(hex, -0.35)}" stop-opacity=".72"/></linearGradient>
      <linearGradient id="glare" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    ${hinge(-1)}${hinge(1)}${lens(-1)}${lens(1)}${bridge}
  </svg>`;
}

const cache = new Map<string, Buffer>();
/** PNG, 900 px wide, transparent background. Cached in memory. */
export function framePNG(id: string, updatedAt: Date | string, f: FrameSpec, hex: string, padded: boolean) {
  const key = `${id}:${new Date(updatedAt).getTime()}:${hex}:${padded ? 1 : 0}`;
  let png = cache.get(key);
  if (!png) {
    png = new Resvg(frameSVG(f, hex, padded), { fitTo: { mode: 'width', value: 900 } }).render().asPng();
    if (cache.size > 400) cache.delete(cache.keys().next().value as string);
    cache.set(key, png);
  }
  return png;
}

export const cleanHex = (v: unknown) => (typeof v === 'string' && /^#?[0-9a-f]{6}$/i.test(v) ? '#' + v.replace('#', '') : null);

/**
 * Replaces text-placeholder product images with drawn frame pictures in any API response
 * (shop, product page, cart, orders, wishlist, admin). Real photos are never touched.
 */
export function swapPlaceholderImages(body: unknown, base: string) {
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (!v || typeof v !== 'object' || depth > 8 || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { for (const x of v) walk(x, depth + 1); return; }
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.shape === 'string' && Array.isArray(o.images)) {
      const variants = Array.isArray(o.variants) ? o.variants as { colorHex?: string }[] : [];
      const hex = (cleanHex(variants[0]?.colorHex) ?? '#1B1F3B').slice(1);
      const url = `${base}/v1/catalog/products/${encodeURIComponent(o.id)}/frame.png?c=${hex}&pad=1`;
      const imgs = o.images as { url?: string }[];
      if (!imgs.length) imgs.push({ url } as { url: string });
      for (const im of imgs) if (im && typeof im.url === 'string' && PLACEHOLDER_IMAGE.test(im.url)) im.url = url;
    }
    for (const k of Object.keys(o)) walk(o[k], depth + 1);
  };
  walk(body, 0);
  return body;
}
