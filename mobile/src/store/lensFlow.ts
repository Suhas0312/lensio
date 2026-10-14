import { create } from 'zustand';
import { LensPackage, LensTypeOption } from '@/api/types';

/** Holds the in-progress lens customisation between steps. */
interface LensFlow {
  variantId: string | null; productName: string; framePrice: number; isSunglasses: boolean;
  type: LensTypeOption | null; pkg: LensPackage | null; coatings: string[];
  prescriptionId: string | null; sendRxLater: boolean;
  start: (p: { variantId: string; productName: string; framePrice: number; isSunglasses: boolean }) => void;
  set: (p: Partial<LensFlow>) => void;
  reset: () => void;
}
const blank = { variantId: null, productName: '', framePrice: 0, isSunglasses: false, type: null, pkg: null, coatings: [], prescriptionId: null, sendRxLater: false };
export const useLensFlow = create<LensFlow>((set) => ({
  ...blank,
  start: (p) => set({ ...blank, ...p }),
  set: (p) => set(p),
  reset: () => set(blank),
}));
