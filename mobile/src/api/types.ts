export type LensType = 'SINGLE_VISION_DISTANCE' | 'SINGLE_VISION_READING' | 'BIFOCAL' | 'PROGRESSIVE' | 'ZERO_POWER';
export type FrameSize = 'SMALL' | 'MEDIUM' | 'WIDE';
export type OrderStatus = 'PAYMENT_PENDING' | 'PLACED' | 'PRESCRIPTION_VERIFIED' | 'LENS_CUTTING_FITTING' | 'QUALITY_CHECK' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
export type PaymentMethod = 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET' | 'COD' | 'UPI_MANUAL';

export interface Variant { id: string; sku: string; colorName: string; colorHex: string; size: FrameSize; stock: number; priceDelta: number }
export interface Product {
  id: string; slug: string; name: string; brand: string; description: string; shape: string; material: string; gender: string;
  isSunglasses: boolean; basePrice: number; mrp: number; lensWidthMm: number; bridgeMm: number; templeMm: number; frameWidthMm: number;
  weightGrams?: number; tryOnImage?: string | null; rating: number; ratingCount: number;
  images: { url: string }[]; variants: Variant[]; sizeBand?: FrameSize;
}
export interface LensPackage { id: string; code: string; name: string; lensType: LensType; index: string; description: string; price: number; maxAbsSph: string; maxAbsCyl: string }
export interface Coating { id: string; code: string; name: string; description: string; price: number }
export interface LensTypeOption {
  lensType: LensType; title: string; subtitle: string; requiresPrescription: boolean; requiresAdd: boolean;
  startingPrice: number; packages: LensPackage[]; allowedCoatings: string[];
}
export interface Prescription {
  id: string; label: string; source: 'UPLOAD' | 'MANUAL'; status: 'PENDING_REVIEW' | 'VERIFIED' | 'REJECTED';
  imageUrl?: string | null; odSph?: string; odCyl?: string; odAxis?: number; odAdd?: string;
  osSph?: string; osCyl?: string; osAxis?: number; osAdd?: string; pdTotal?: string; isHighPower: boolean; createdAt: string;
}
export interface Address { id: string; fullName: string; phone: string; altPhone?: string | null; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string; isDefault: boolean }
export interface RazorpayInit { keyId: string; razorpayOrderId: string; amount: number; currency: 'INR'; prefill: { contact: string; name: string; email: string } }
export interface UpiInfo {
  upiId: string | null; payeeName: string; amount: number; uri: string | null; qrImage: string | null;
  amountPrefilled: boolean; submitted?: boolean; utr?: string | null; rejectedReason?: string | null;
}
export interface PaymentOptions { razorpay: boolean; upiManual: boolean; cod: boolean }
