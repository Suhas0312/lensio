import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { getJSON, setJSON } from '@/lib/deviceStore';

// Phones keep the sign-in token in the secure keychain; browsers use localStorage.
const store = Platform.OS === 'web'
  ? {
      getItemAsync: async (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
      setItemAsync: async (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
      deleteItemAsync: async (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } },
    }
  : SecureStore;

export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? (Constants.expoConfig?.extra?.apiUrl as string) ?? 'http://localhost:4000/v1';

const TOKEN_KEY = 'lensio.token';
let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export async function loadToken() { token = await store.getItemAsync(TOKEN_KEY); return token; }
export async function saveToken(t: string | null) {
  token = t;
  if (t) await store.setItemAsync(TOKEN_KEY, t); else await store.deleteItemAsync(TOKEN_KEY);
}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; form?: FormData } = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: opts.method ?? (opts.body || opts.form ? 'POST' : 'GET'),
      headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'No internet connection. Check your network and try again.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && onUnauthorized) onUnauthorized();
    throw new ApiError(res.status, json?.error?.code ?? 'ERROR', json?.error?.message ?? 'Something went wrong', json?.error?.details);
  }
  return json as T;
}

/** Online/offline state, shown as a small banner when the shop is browsed from saved data. */
export const useNet = create<{ offline: boolean; set: (offline: boolean) => void }>((set) => ({ offline: false, set: (offline) => set({ offline }) }));

/**
 * Instant loading + offline browsing for read-only pages (frames, product pages, home lists):
 * shows the copy saved on the device straight away (onCached), then refreshes from the server.
 * Without internet the saved copy is used and the offline banner appears.
 */
export async function cachedApi<T>(path: string, onCached?: (data: T) => void): Promise<T> {
  const key = `get:${path}`;
  const saved = await getJSON<{ at: number; data: T }>(key);
  if (saved && onCached) onCached(saved.data);
  try {
    const fresh = await api<T>(path);
    useNet.getState().set(false);
    setJSON(key, { at: Date.now(), data: fresh });
    return fresh;
  } catch (e) {
    if ((e as ApiError).code === 'NETWORK') {
      useNet.getState().set(true);
      if (saved) return saved.data;
    }
    throw e;
  }
}

export const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + p.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&') : '';
};
