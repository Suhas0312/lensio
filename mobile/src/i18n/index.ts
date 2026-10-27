import { create } from 'zustand';
import { getItem, getJSON, setItem, setJSON } from '@/lib/deviceStore';
import { api } from '@/api/client';
import { Key, Lang, LANGS, STRINGS } from './strings';
import { autoTr, connectTranslator, learn, useAutoDict } from './auto';

// Missing translations are made by the Lensio server (AI) and kept on this phone.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
connectTranslator(
  (lang, texts) => api<Record<string, string>>('/i18n/translate', { body: { lang, texts } }),
  (lang, dict) => { if (saveTimer) clearTimeout(saveTimer); saveTimer = setTimeout(() => setJSON(`i18n.${lang}`, dict), 1500); },
);
/** Loads saved translations for a language: first from the phone (instant), then the latest from the server. */
async function loadLang(lang: string) {
  if (lang === 'en') return;
  try { const saved = await getJSON<Record<string, string>>(`i18n.${lang}`); if (saved) learn(lang, saved); } catch { /* ignore */ }
  try {
    const fresh = await api<Record<string, string>>(`/i18n/${lang}`);
    if (learn(lang, fresh)) setJSON(`i18n.${lang}`, { ...((await getJSON<Record<string, string>>(`i18n.${lang}`)) ?? {}), ...fresh });
  } catch { /* offline: phone copy is enough */ }
}

export { LANGS };
export { autoTr, autoChildren, useAutoDict } from './auto';
export type { Lang, Key };

/** First launch: the phone's own language if we have it, otherwise English. */
function deviceLang(): Lang {
  try {
    const loc = (Intl.DateTimeFormat().resolvedOptions().locale || 'en').toLowerCase().split('-')[0];
    return (LANGS.some((l) => l.code === loc) ? loc : 'en') as Lang;
  } catch { return 'en'; }
}

interface LangState { lang: Lang; ready: boolean; set: (l: Lang) => void; init: () => Promise<void> }
export const useLang = create<LangState>((set, get) => ({
  lang: 'en', ready: false,
  set: (lang) => { set({ lang }); setItem('lang', lang); loadLang(lang); },
  async init() {
    if (get().ready) return;
    const saved = (await getItem('lang')) as Lang | null;
    const lang = saved && LANGS.some((l) => l.code === saved) ? saved : deviceLang();
    set({ lang, ready: true });
    loadLang(lang);
  },
}));

/** Text in the chosen language (falls back to English for anything not translated yet). */
/** Words in {curly braces} are filled in from vars, e.g. t('updateAvailable', { v: '1.2' }). */
export const translate = (lang: Lang, key: Key, vars?: Record<string, string | number>) => {
  const own = STRINGS[lang]?.[key];
  const text = own ?? STRINGS.en[key] ?? key;
  const filled = vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
  return own ? filled : autoTr(lang, filled);   // not in the list for this language: translated automatically
};
export function useT() {
  const lang = useLang((s) => s.lang);
  useAutoDict((s) => s.v);
  return (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars);
}

/** Translate any English text (for text that isn't drawn by <Text>, e.g. screen titles). */
export function useTr() {
  const lang = useLang((s) => s.lang);
  useAutoDict((s) => s.v);
  return (text: string) => autoTr(lang, text);
}
/** Same, outside components (alerts, error messages). */
export const tr = (text: string) => autoTr(useLang.getState().lang, text);
