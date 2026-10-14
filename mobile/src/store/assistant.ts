import { create } from 'zustand';

export interface ProductCard { slug: string; name: string; price: number; mrp: number; image: string | null }
export interface Msg { id: string; role: 'user' | 'assistant'; text: string; products?: ProductCard[]; handoff?: boolean; failed?: boolean }

const hello: Msg = {
  id: 'hello', role: 'assistant',
  text: "Hi! I'm the Lensio assistant. Ask me about frames for your face shape, which lenses to choose, what your prescription means, or where your order is.",
};

/** Chat history for this session (cleared when the app is closed). */
export const useAssistant = create<{ messages: Msg[]; add: (m: Msg) => void; reset: () => void }>((set) => ({
  messages: [hello],
  add: (m) => set((s) => ({ messages: [...s.messages, m] })),
  reset: () => set({ messages: [hello] }),
}));
