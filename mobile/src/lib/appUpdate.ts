import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';
import { create } from 'zustand';
import { api } from '@/api/client';

/**
 * In-app updates for the Android APK (outside the Play Store).
 * The new APK is downloaded inside the app and handed to Android's installer, which updates the
 * existing app in place: customers stay signed in and keep their orders, cart and settings.
 */
export interface UpdateInfo { version: string; url: string; notes: string | null; required: boolean }

export const currentVersion = () => Constants.expoConfig?.version ?? '0.0.0';
export const isNewer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
};

type Phase = 'idle' | 'downloading' | 'installing' | 'failed';
interface UpdateState {
  info: UpdateInfo | null; open: boolean; phase: Phase; progress: number; error: string | null;
  check: (force?: boolean) => Promise<boolean>; show: () => void; later: () => Promise<void>; start: () => Promise<void>;
}

const SNOOZE_FILE = `${FileSystem.documentDirectory}lensio-update-snooze.json`;
const SNOOZE_MS = 24 * 3600_000;                 // "Later" hides the window for a day (the Home banner stays)

async function snoozed(version: string) {
  try {
    const s = JSON.parse(await FileSystem.readAsStringAsync(SNOOZE_FILE)) as { version: string; at: number };
    return s.version === version && Date.now() - s.at < SNOOZE_MS;
  } catch { return false; }
}

export const useAppUpdate = create<UpdateState>((set, get) => ({
  info: null, open: false, phase: 'idle', progress: 0, error: null,

  /** Looks for a newer APK. force: the customer tapped "Check for updates", so show it even after "Later". Returns true if one exists. */
  async check(force = false) {
    if (Platform.OS !== 'android') return false;
    try {
      const c = await api<{ app?: { androidApkUrl: string | null; latestVersion: string | null; minVersion?: string | null; notes?: string | null } }>('/config');
      const a = c.app, mine = currentVersion();
      if (!a?.androidApkUrl || !a.latestVersion || !isNewer(a.latestVersion, mine)) { set({ info: null, open: false }); return false; }
      const required = !!a.minVersion && isNewer(a.minVersion, mine);
      const info = { version: a.latestVersion, url: a.androidApkUrl, notes: a.notes ?? null, required };
      set({ info, open: force || required || !(await snoozed(info.version)) });
      return true;
    } catch { if (force) throw new Error('offline'); return false; /* offline: try again next launch */ }
  },

  show() { if (get().info) set({ open: true, error: null, phase: get().phase === 'failed' ? 'idle' : get().phase }); },

  async later() {
    const info = get().info; if (!info || info.required) return;
    set({ open: false });
    try { await FileSystem.writeAsStringAsync(SNOOZE_FILE, JSON.stringify({ version: info.version, at: Date.now() })); } catch { /* ignore */ }
  },

  async start() {
    const info = get().info; if (!info || get().phase === 'downloading') return;
    set({ phase: 'downloading', progress: 0, error: null });
    const file = `${FileSystem.cacheDirectory}lensio-${info.version}.apk`;
    try {
      await FileSystem.deleteAsync(file, { idempotent: true });
      const dl = FileSystem.createDownloadResumable(info.url, file, {}, (p) => {
        if (p.totalBytesExpectedToWrite > 0) set({ progress: p.totalBytesWritten / p.totalBytesExpectedToWrite });
      });
      const res = await dl.downloadAsync();
      if (!res || res.status !== 200) throw new Error('download ' + (res?.status ?? 'failed'));
      set({ phase: 'installing', progress: 1 });
      const IntentLauncher = require('expo-intent-launcher') as typeof import('expo-intent-launcher');
      const contentUri = await FileSystem.getContentUriAsync(res.uri);
      // Android shows "Do you want to update this app?" → Update. Data is kept.
      await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
        data: contentUri, type: 'application/vnd.android.package-archive',
        flags: 1 /* FLAG_GRANT_READ_URI_PERMISSION */ | 0x10000000 /* FLAG_ACTIVITY_NEW_TASK */,
      });
      // Back here means the installer was closed without updating (or Android asked to allow installs first).
      set({ phase: 'idle' });
    } catch {
      set({ phase: 'failed', error: 'The update could not be downloaded. Check your internet, or download it in the browser instead.' });
    }
  },
}));

/** Fallback: open the APK link in the browser (also updates in place when installed). */
export const openInBrowser = () => { const u = useAppUpdate.getState().info?.url; if (u) Linking.openURL(u); };
