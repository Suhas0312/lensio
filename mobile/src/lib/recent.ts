import { create } from 'zustand';
import { getJSON, setJSON } from '@/lib/deviceStore';

/** Recently viewed frames, kept on this device (newest first, up to 12). */
export interface RecentItem { id: string; slug: string; name: string; image: string | null; price: number }
let loading: Promise<void> | null = null;
export const useRecent = create<{ items: RecentItem[]; ready: boolean; init: () => Promise<void>; add: (x: RecentItem) => Promise<void> }>((set, get) => ({
  items: [], ready: false,
  async init() {
    if (get().ready) return;
    loading ??= getJSON<RecentItem[]>('recent').then((saved) => { if (!get().ready) set({ items: saved ?? [], ready: true }); });
    await loading;
  },
  // Loads the saved list first: adding before it was read used to overwrite the whole history.
  async add(x) {
    await get().init();
    const items = [x, ...get().items.filter((i) => i.id !== x.id)].slice(0, 12);
    set({ items }); setJSON('recent', items);
  },
}));
