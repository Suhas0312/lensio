import { useEffect } from 'react';
import { create } from 'zustand';
import { cachedApi } from '@/api/client';

/** Shop features the owner switches on/off in admin → Settings (e.g. Eye test at home). */
interface Features { eyeTest: boolean; loaded: boolean }
const useStore = create<Features>(() => ({ eyeTest: false, loaded: false }));
let started = false;

export function useFeatures() {
  useEffect(() => {
    if (started) return;
    started = true;
    const apply = (c: { features?: { eyeTest?: boolean } }) => useStore.setState({ eyeTest: !!c.features?.eyeTest, loaded: true });
    cachedApi<{ features?: { eyeTest?: boolean } }>('/config', apply).then(apply).catch(() => useStore.setState({ loaded: true }));
  }, []);
  return useStore();
}
