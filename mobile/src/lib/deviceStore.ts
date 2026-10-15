import { Platform } from 'react-native';

/**
 * Small key-value storage that survives app restarts: browser storage on the website,
 * a file on the phone in the Android app. Used for instant loading / offline browsing,
 * the compare list and other conveniences. Never for secrets (the sign-in token uses secure storage).
 */
const mem = new Map<string, string>();
const safe = (key: string) => key.replace(/[^a-z0-9_.-]/gi, '_').slice(0, 120);

async function nativeFile(key: string) {
  const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
  const dir = `${FileSystem.documentDirectory}lensio-store/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  return { FileSystem, path: `${dir}${safe(key)}.json` };
}

export async function getItem(key: string): Promise<string | null> {
  if (mem.has(key)) return mem.get(key)!;
  try {
    if (Platform.OS === 'web') return typeof localStorage !== 'undefined' ? localStorage.getItem(`lensio:${key}`) : null;
    const { FileSystem, path } = await nativeFile(key);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const v = await FileSystem.readAsStringAsync(path);
    mem.set(key, v);
    return v;
  } catch { return null; }
}

export async function setItem(key: string, value: string) {
  mem.set(key, value);
  try {
    if (Platform.OS === 'web') { localStorage.setItem(`lensio:${key}`, value); return; }
    const { FileSystem, path } = await nativeFile(key);
    await FileSystem.writeAsStringAsync(path, value);
  } catch { /* storage full or unavailable: memory copy still works this session */ }
}

export async function getJSON<T>(key: string): Promise<T | null> {
  const v = await getItem(key);
  if (!v) return null;
  try { return JSON.parse(v) as T; } catch { return null; }
}
export const setJSON = (key: string, value: unknown) => setItem(key, JSON.stringify(value));
