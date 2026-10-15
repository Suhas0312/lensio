import { Alert } from 'react-native';
import { router } from 'expo-router';
import { create } from 'zustand';
import { api } from '@/api/client';
import { Product } from '@/api/types';
import { getJSON, setJSON } from '@/lib/deviceStore';
import { useAuth } from '@/store/auth';

/** ♥ Wishlist: saved on the account (works across the app and the website). */
interface WishState {
  ids: Set<string>; loaded: boolean;
  load: () => Promise<void>; toggle: (p: Product) => Promise<void>; has: (id: string) => boolean;
}
export const useWishlist = create<WishState>((set, get) => ({
  ids: new Set(), loaded: false,
  async load() {
    if (!useAuth.getState().user) { set({ ids: new Set(), loaded: true }); return; }
    try { const list = await api<Product[]>('/catalog/wishlist'); set({ ids: new Set(list.map((p) => p.id)), loaded: true }); } catch { set({ loaded: true }); }
  },
  has: (id) => get().ids.has(id),
  async toggle(p) {
    if (!useAuth.getState().user) {
      Alert.alert('Save to your wishlist', 'Sign in to save frames you like.', [{ text: 'Not now', style: 'cancel' }, { text: 'Sign in', onPress: () => router.push('/(auth)/login') }]);
      return;
    }
    const had = get().ids.has(p.id), next = new Set(get().ids);
    had ? next.delete(p.id) : next.add(p.id); set({ ids: next });            // instant, then save
    try { await api(`/catalog/wishlist/${p.id}`, { method: had ? 'DELETE' : 'PUT' }); }
    catch { const back = new Set(get().ids); had ? back.add(p.id) : back.delete(p.id); set({ ids: back }); }
  },
}));

/** ⇄ Compare: up to 3 frames side by side. Kept on the device. */
export const COMPARE_MAX = 3;
interface CompareState {
  items: Product[]; ready: boolean;
  init: () => Promise<void>; toggle: (p: Product) => void; has: (id: string) => boolean; clear: () => void;
}
export const useCompare = create<CompareState>((set, get) => ({
  items: [], ready: false,
  async init() { if (get().ready) return; set({ items: (await getJSON<Product[]>('compare')) ?? [], ready: true }); },
  has: (id) => get().items.some((p) => p.id === id),
  toggle(p) {
    const cur = get().items;
    let next: Product[];
    if (cur.some((x) => x.id === p.id)) next = cur.filter((x) => x.id !== p.id);
    else if (cur.length >= COMPARE_MAX) { Alert.alert('Compare up to 3 frames', 'Remove one from the compare list first.'); return; }
    else next = [...cur, p];
    set({ items: next }); setJSON('compare', next);
  },
  clear() { set({ items: [] }); setJSON('compare', []); },
}));
