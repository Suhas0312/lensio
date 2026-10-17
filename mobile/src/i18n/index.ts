import { create } from 'zustand';
import { getItem, setItem } from '@/lib/deviceStore';
import { Key, Lang, LANGS, STRINGS } from './strings';

export { LANGS };
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
  set: (lang) => { set({ lang }); setItem('lang', lang); },
  async init() {
    if (get().ready) return;
    const saved = (await getItem('lang')) as Lang | null;
    set({ lang: saved && LANGS.some((l) => l.code === saved) ? saved : deviceLang(), ready: true });
  },
}));

/** Text in the chosen language (falls back to English for anything not translated yet). */
export const translate = (lang: Lang, key: Key) => STRINGS[lang]?.[key] ?? STRINGS.en[key] ?? key;
export function useT() {
  const lang = useLang((s) => s.lang);
  return (key: Key) => translate(lang, key);
}
