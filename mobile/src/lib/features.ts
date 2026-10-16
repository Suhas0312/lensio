import { useEffect } from 'react';
import { create } from 'zustand';
import { cachedApi } from '@/api/client';

/** Shop features the owner switches on/off in admin → Settings (e.g. Eye test at home). */
interface Features { eyeTest: boolean; stores: boolean; assistant: boolean; loaded: boolean }
const useStore = create<Features>(() => ({ eyeTest: false, stores: true, assistant: true, loaded: false }));
let started = false;

export function useFeatures() {
  useEffect(() => {
    if (started) return;
    started = true;
    type F = { features?: { eyeTest?: boolean; stores?: boolean; assistant?: boolean } };
    const apply = (c: F) => useStore.setState({ eyeTest: !!c.features?.eyeTest, stores: c.features?.stores !== false, assistant: c.features?.assistant !== false, loaded: true });
    cachedApi<F>('/config', apply).then(apply).catch(() => useStore.setState({ loaded: true }));
  }, []);
  return useStore();
}
