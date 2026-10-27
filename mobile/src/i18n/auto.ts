import { Children, isValidElement, ReactNode } from 'react';
import { create } from 'zustand';
import { KN } from './phrases.kn';

/**
 * Automatic translation of English text on screen. Nothing has to be added by hand.
 * Every <Text>, button, field, chip, alert and screen title passes its text through here:
 *  1. Built-in phrase lists (phrases.kn.ts) are used first: instant and free.
 *  2. Anything else (new screens, product text from the admin panel, server messages, other languages)
 *     is sent to the Lensio server, translated once by AI, saved there for every customer, and kept on the phone.
 *     It shows in English for a moment the very first time, then switches by itself.
 */
const PHRASES: Record<string, Record<string, string>> = { kn: KN };

type Pattern = { re: RegExp; out: string };
const cache: Record<string, { exact: Record<string, string>; patterns: Pattern[] }> = {};
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function table(lang: string) {
  if (cache[lang]) return cache[lang];
  const src = PHRASES[lang] ?? {};
  const exact: Record<string, string> = {}, patterns: Pattern[] = [];
  for (const [en, tr] of Object.entries(src)) {
    const k = norm(en);
    if (/\{#?\d\}/.test(k)) {
      // "Showing {0} of {1} frames" → /^Showing (.+?) of (.+?) frames$/   ({#0} = a number or price only)
      const order: number[] = [];
      const body = k.split(/(\{#?\d\})/).map((part) => {
        const m = part.match(/^\{(#?)(\d)\}$/);
        if (m) { order.push(Number(m[2])); return m[1] ? '(₹?[\\d][\\d.,]*)' : '(.+?)'; }
        return escape(part);
      }).join('');
      const out = tr.replace(/\{#?(\d)\}/g, (_, n) => `{${order.indexOf(Number(n))}}`);
      patterns.push({ re: new RegExp(`^${body}$`), out });
    } else exact[k] = tr;
  }
  // Longer patterns first, so the most specific one wins.
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return (cache[lang] = { exact, patterns });
}

// ---------- Learned translations (made by the server's AI, kept on the device)
/** Bumps whenever new translations arrive, so text on screen redraws in the new language. */
export const useAutoDict = create<{ v: number }>(() => ({ v: 0 }));
const learned: Record<string, Record<string, string>> = {};
const asked: Record<string, Set<string>> = {};
const queue: Record<string, Set<string>> = {};
let timer: ReturnType<typeof setTimeout> | null = null;

type Fetcher = (lang: string, texts: string[]) => Promise<Record<string, string>>;
type Saver = (lang: string, dict: Record<string, string>) => void;
let fetcher: Fetcher | null = null, saver: Saver | null = null;
/** Connects the translator to the server and to phone storage (done in i18n/index.ts). */
export function connectTranslator(f: Fetcher, save: Saver) { fetcher = f; saver = save; }

/** Adds translations (from phone storage or the server) and redraws the screen. */
export function learn(lang: string, dict: Record<string, string>) {
  const d = (learned[lang] ??= {});
  let added = 0;
  for (const [k, v] of Object.entries(dict)) if (typeof v === 'string' && v && d[k] !== v) { d[k] = v; added++; }
  if (added) useAutoDict.setState((s) => ({ v: s.v + 1 }));
  return added;
}
export const learnedFor = (lang: string) => learned[lang] ?? {};

/** Numbers and prices become {0}, {1}…, so "Showing 12 of 40" and "Showing 3 of 9" share one translation. */
function toTemplate(k: string) {
  const vals: string[] = [];
  const t = k.replace(/₹?\d[\d,]*(?:\.\d+)?/g, (m) => `{${vals.push(m) - 1}}`);
  return { t, vals: vals.length > 9 ? null : vals };
}
const fill = (tpl: string, vals: string[]) => tpl.replace(/\{(\d)\}/g, (m, i) => vals[Number(i)] ?? m);

/** Text worth sending for translation: real words, not emails, links, codes or very long user text. */
const worthAsking = (t: string) =>
  t.length <= 400 && /[a-z]{2}/.test(t) && !/@|https?:|www\.|\.com\b|[\\/<>{}=;]{2,}/.test(t.replace(/\{\d\}/g, ''));

function ask(lang: string, tpl: string) {
  if (!fetcher || !worthAsking(tpl)) return;
  const done = (asked[lang] ??= new Set());
  if (done.has(tpl)) return;
  done.add(tpl);
  (queue[lang] ??= new Set()).add(tpl);
  if (!timer) timer = setTimeout(flush, 350);   // collect a screenful, then ask once
}

async function flush() {
  timer = null;
  for (const lang of Object.keys(queue)) {
    const all = [...queue[lang]];
    delete queue[lang];
    for (let i = 0; i < all.length; i += 60) {
      const batch = all.slice(i, i + 60);
      try {
        const got = await fetcher!(lang, batch);
        if (learn(lang, got)) saver?.(lang, learned[lang]);
        // Not translated this time (server busy): allow another try later.
        for (const t of batch) if (!(t in got)) setTimeout(() => asked[lang]?.delete(t), 60_000);
      } catch {
        for (const t of batch) setTimeout(() => asked[lang]?.delete(t), 60_000);
      }
    }
  }
}

/** Translate one piece of text. Returns English until a translation is ready (then the screen redraws). */
export function autoTr(lang: string, s: string): string {
  if (lang === 'en' || typeof s !== 'string' || !/[A-Za-z]/.test(s)) return s;
  const { exact, patterns } = table(lang);
  const k = norm(s);
  if (!k) return s;
  let r = exact[k];
  if (r === undefined) {
    for (const p of patterns) {
      const m = k.match(p.re);
      if (m) { r = p.out.replace(/\{(\d)\}/g, (_, i) => { const v = m[Number(i) + 1]; return exact[v] ?? learned[lang]?.[v] ?? v; }); break; }
    }
  }
  if (r === undefined) {
    const { t, vals } = toTemplate(k);
    // Phone numbers, PIN codes and order references (6+ digits) are customer details: never sent anywhere.
    if (vals && /[A-Za-z]{2}/.test(t) && !/\d{6,}/.test(k.replace(/[\s-]/g, ''))) {
      const got = learned[lang]?.[t];
      if (got !== undefined) r = fill(got, vals); else ask(lang, t);
    }
  }
  if (r === undefined) return s;
  return (/^\s/.test(s) ? ' ' : '') + r + (/\s$/.test(s) ? ' ' : '');
}

const primitive = (c: unknown) => c == null || typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean';

/** Translate the children of a <Text>: a whole sentence when it is plain text and numbers, otherwise each text piece. */
export function autoChildren(lang: string, children: ReactNode): ReactNode {
  if (lang === 'en' || children == null) return children;
  if (typeof children === 'string') return autoTr(lang, children);
  if (!Array.isArray(children)) return children;
  const flat = children.flat(Infinity as 1) as ReactNode[];
  if (flat.every(primitive)) {
    const joined = flat.filter((c) => c != null && c !== false && c !== true).join('');
    return autoTr(lang, joined);   // one whole sentence, so it is translated (and asked for) as a sentence
  }
  return Children.map(children, (c) => (typeof c === 'string' ? autoTr(lang, c) : isValidElement(c) ? c : c));
}
