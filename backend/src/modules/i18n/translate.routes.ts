import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';
import { ah } from '../../lib/asyncHandler';
import { askGeminiText, geminiKeys } from '../assistant/assistant.service';
import { APP_PHRASES } from './appPhrases';

/**
 * Automatic translation of app text. The app sends any English text it has no translation for;
 * we translate it once with Gemini, save it, and every customer gets the saved version after that.
 * Nothing needs to be added by hand: new screens, admin product text and messages are covered automatically.
 */
const r = Router();

export const LANG_NAMES: Record<string, string> = {
  hi: 'Hindi', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', ml: 'Malayalam', mr: 'Marathi',
  bn: 'Bengali', gu: 'Gujarati', pa: 'Punjabi', or: 'Odia',
};
const MAX_LEN = 400;
const BATCH = 25;

const system = (language: string) => `You translate the screen text of Lensio, an Indian online eyewear shop (frames, prescription lenses, sunglasses), from English into ${language}.
You get a JSON array of English texts. Reply with ONLY a JSON array of the ${language} translations, in the same order, with exactly the same number of items. No other words.
Rules:
- Write natural, simple, friendly ${language} that ordinary shoppers in India use. Short labels stay short. Buttons are polite commands.
- Keep exactly as written: placeholders like {0}, {1} and {#0} (move them to where they belong in the sentence), numbers, ₹ amounts, emojis, symbols (→ ✓ ★ · • ♥), email addresses, links, codes such as FIRST10.
- Do not translate: the brand Lensio, frame and product model names (e.g. "Vista Rectangle", "Orbit Round"), people's names, place names, and app or payment names (WhatsApp, Google Pay, PhonePe, Paytm, UPI, Instagram, Safari, Chrome, Android).
- Keep optical terms shoppers know in English where usual (SPH, CYL, AXIS, ADD, PD, TR90, 1.56, 1.60) and you may write common English shopping words in ${language} script if that is how people say them.
- If a text is only a name, code or number, return it unchanged.`;

/** Translations being made right now, so two customers asking at once share one AI request. */
const inFlight = new Map<string, Promise<void>>();

async function translateMissing(lang: string, texts: string[], batch = BATCH): Promise<'ok' | 'limit'> {
  const language = LANG_NAMES[lang];
  let result: 'ok' | 'limit' = 'ok';
  for (let i = 0; i < texts.length; i += batch) {
    const chunk = texts.slice(i, i + batch);
    try {
      const raw = await askGeminiText(system(language), JSON.stringify(chunk), 8000);
      const json = raw.slice(raw.indexOf('['), raw.lastIndexOf(']') + 1);
      const out = JSON.parse(json) as unknown[];
      if (!Array.isArray(out) || out.length !== chunk.length) throw new Error(`expected ${chunk.length} items, got ${Array.isArray(out) ? out.length : 'none'}`);
      const holes = (s: string) => (s.match(/\{#?\d\}/g) ?? []).sort().join();
      const rows = chunk.flatMap((source, k) => {
        const text = typeof out[k] === 'string' ? (out[k] as string).trim() : '';
        // Skip anything that came back empty, far too long, or lost a {0} placeholder.
        if (!text || text.length > MAX_LEN * 3 || holes(text) !== holes(source)) return [];
        return [{ lang, source, text }];
      });
      if (rows.length) await prisma.translation.createMany({ data: rows, skipDuplicates: true });
    } catch (e) {
      logger.warn({ lang, count: chunk.length, err: (e as Error).message }, 'Automatic translation failed (English is shown meanwhile)');
      if ((e as { status?: number }).status === 429) { result = 'limit'; break; }   // daily AI limit: try again later
    }
  }
  return result;
}

let warming = false;
/**
 * Background job: makes sure every sentence of the app is translated into every language, so no customer
 * sees English. Runs a few minutes after start-up and every few hours; only sends what is still missing,
 * slowly (one request every 20 s) so the AI assistant's daily limit is not used up. Stops for the day at the limit.
 */
export async function translateAppPhrases() {
  if (warming || !geminiKeys().length) return;
  warming = true;
  try {
    for (const lang of Object.keys(LANG_NAMES)) {
      const have = new Set((await prisma.translation.findMany({ where: { lang, source: { in: APP_PHRASES } }, select: { source: true } })).map((x) => x.source));
      const missing = APP_PHRASES.filter((t) => !have.has(t));
      if (!missing.length) continue;
      logger.info({ lang, missing: missing.length }, 'Translating app text in the background');
      for (let i = 0; i < missing.length; i += 50) {
        if ((await translateMissing(lang, missing.slice(i, i + 50), 50)) === 'limit') { logger.warn('AI daily limit reached: app translation continues later'); return; }
        await new Promise((r) => setTimeout(r, 20_000));
      }
    }
  } finally { warming = false; }
}

/** Everything already translated for a language: the app loads this once when the language is chosen. */
r.get('/:lang', ah(async (req, res) => {
  const lang = String(req.params.lang);
  if (!LANG_NAMES[lang]) return res.json({});
  const rows = await prisma.translation.findMany({ where: { lang }, select: { source: true, text: true }, take: 20000 });
  res.set('Cache-Control', 'public, max-age=300');
  res.json(Object.fromEntries(rows.map((x) => [x.source, x.text])));
}));

const body = z.object({
  lang: z.string().max(5),
  texts: z.array(z.string().min(1).max(MAX_LEN)).min(1).max(80),
});

/** Translate texts the app is missing. Returns what is ready; anything that fails stays English and is tried again later. */
r.post('/translate', rateLimit({ windowMs: 60_000, limit: 40, standardHeaders: true, legacyHeaders: false }), ah(async (req, res) => {
  const parsed = body.safeParse(req.body);
  if (!parsed.success || !LANG_NAMES[parsed.data.lang]) return res.json({});
  const { lang } = parsed.data;
  const texts = [...new Set(parsed.data.texts.map((t) => t.trim()).filter((t) => /[A-Za-z]{2}/.test(t)))];
  const have = async () => Object.fromEntries((await prisma.translation.findMany({ where: { lang, source: { in: texts } }, select: { source: true, text: true } })).map((x) => [x.source, x.text]));
  let found = await have();
  const missing = texts.filter((t) => !(t in found));
  if (missing.length && geminiKeys().length) {
    const key = `${lang}\n${missing.join('\n')}`;
    let job = inFlight.get(key);
    if (!job) { job = translateMissing(lang, missing).then(() => undefined).finally(() => inFlight.delete(key)); inFlight.set(key, job); }
    await job;
    found = await have();
  }
  res.json(found);
}));

export default r;
