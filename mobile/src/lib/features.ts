import { useEffect } from 'react';
import { create } from 'zustand';
import { cachedApi } from '@/api/client';

/** Shop features the owner switches on/off in admin → Settings (e.g. Eye test at home). */
interface Features { eyeTest: boolean; stores: boolean; assistant: boolean; bannerDesktop: number; bannerMobile: number; loaded: boolean }
const useStore = create<Features>(() => ({ eyeTest: false, stores: true, assistant: true, bannerDesktop: 8 / 3, bannerMobile: 8 / 5, loaded: false }));
let started = false;
/** '16:9' → 1.78 (banner width ÷ height); anything unexpected keeps the default. */
const ratio = (v: string | undefined, dflt: number) => {
  const m = /^(\d+):(\d+)$/.exec(v ?? ''); const r = m ? +m[1] / +m[2] : NaN;
  return r >= 0.5 && r <= 4 ? r : dflt;   // same limits as the server (1:2 tall … 4:1 wide); custom like 1920:1080 works
};

export function useFeatures() {
  useEffect(() => {
    if (started) return;
    started = true;
    type F = { features?: { eyeTest?: boolean; stores?: boolean; assistant?: boolean }; banner?: { desktop?: string; mobile?: string } };
    const apply = (c: F) => useStore.setState({ eyeTest: !!c.features?.eyeTest, stores: c.features?.stores !== false, assistant: c.features?.assistant !== false,
      bannerDesktop: ratio(c.banner?.desktop, 8 / 3), bannerMobile: ratio(c.banner?.mobile, 8 / 5), loaded: true });
    cachedApi<F>('/config', apply).then(apply).catch(() => useStore.setState({ loaded: true }));
  }, []);
  return useStore();
}
