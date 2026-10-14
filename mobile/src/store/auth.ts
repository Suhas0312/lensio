import { create } from 'zustand';
import { api, loadToken, saveToken, setUnauthorizedHandler } from '@/api/client';

interface User { id: string; phone?: string | null; phoneVerified?: boolean; name?: string | null; email?: string | null; role: string; hasPassword?: boolean; pointsBalance?: number }
interface AuthState {
  ready: boolean; user: User | null;
  boot: () => Promise<void>;
  signIn: (token: string, user: User) => Promise<void>;
  signOut: () => Promise<void>;
  setUser: (u: User) => void;
}

export const useAuth = create<AuthState>((set) => ({
  ready: false, user: null,
  boot: async () => {
    setUnauthorizedHandler(() => { void saveToken(null); set({ user: null }); });
    const t = await loadToken();
    if (t) {
      try { set({ user: await api<User>('/auth/me') }); } catch { await saveToken(null); }
    }
    set({ ready: true });
  },
  signIn: async (token, user) => { await saveToken(token); set({ user }); },
  signOut: async () => { await saveToken(null); set({ user: null }); },
  setUser: (user) => set({ user }),
}));
