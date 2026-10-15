import QRCode from 'qrcode';
import { prisma } from '../../lib/prisma';

/** Shop settings, edited in the admin panel. */
export interface ShopSettings {
  upiId: string | null;        // e.g. lensio@okaxis
  upiPayeeName: string;        // name shown in the customer's UPI app
  upiQrImage: string | null;   // optional uploaded QR image (public URL), used when no UPI ID is set
  codEnabled: boolean;
  androidApkUrl: string | null;   // public link to the latest APK (e.g. on Cloudflare R2)
  androidLatestVersion: string | null; // e.g. 1.0.1; the app shows "Update available" when it's older
  androidMinVersion: string | null;    // apps older than this must update before they can be used
  androidUpdateNotes: string | null;   // "What's new", shown in the app's update window
  androidReleaseRepo: string | null;   // GitHub repo with the APK releases (e.g. Suhas0312/lensio); read automatically
  shopInfo: string | null;             // free text for the AI assistant: returns, hours, address, delivery areas
  instagramUrl: string | null;         // shown in the app, download page and assistant
  // Automation
  ownerEmailAlerts: boolean;           // email ADMIN_EMAILS about new orders, payments to check, prescriptions, problems
  autoStartLensWork: boolean;          // prescription verified → lens cutting & fitting straight away
  eyeTestEnabled: boolean;             // "Eye test at home" bookings shown to customers (off until the shop is ready)
  autoApproveTypedRx: boolean;         // typed prescriptions that pass all checks (and aren't high power) are approved automatically
  frameOnlyToQc: boolean;              // frame-only orders skip the lens steps and go straight to quality check
  // Loyalty
  loyaltyEnabled: boolean;
  loyaltyPointsPer100: number;         // points earned per ₹100 of subtotal (1 point = ₹1 redemption value)
  loyaltyMaxRedeemPercent: number;     // points can cover at most this % of an order's subtotal
  // Reviews
  reviewsAutoApprove: boolean;         // customer reviews go live immediately instead of waiting for moderation
}

const DEFAULTS: ShopSettings = { upiId: null, upiPayeeName: 'Lensio', upiQrImage: null, codEnabled: false, androidApkUrl: null, androidLatestVersion: null, androidMinVersion: null, androidUpdateNotes: null, androidReleaseRepo: null, shopInfo: null, instagramUrl: null,
  ownerEmailAlerts: true, autoStartLensWork: true, autoApproveTypedRx: false, frameOnlyToQc: true, eyeTestEnabled: false,
  loyaltyEnabled: true, loyaltyPointsPer100: 5, loyaltyMaxRedeemPercent: 20, reviewsAutoApprove: true };

let cache: { at: number; v: ShopSettings } | null = null;
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : v === 'true');

export async function getSettings(): Promise<ShopSettings> {
  if (cache && Date.now() - cache.at < 30_000) return cache.v;
  const rows = await prisma.setting.findMany();
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const v: ShopSettings = {
    upiId: m.upiId || null,
    upiPayeeName: m.upiPayeeName || DEFAULTS.upiPayeeName,
    upiQrImage: m.upiQrImage || null,
    codEnabled: false,   // Cash on Delivery removed: UPI / online payment only (anti-fraud). Old COD orders still complete in admin.
    androidApkUrl: m.androidApkUrl || null,
    androidLatestVersion: m.androidLatestVersion || null,
    androidMinVersion: m.androidMinVersion || null,
    androidUpdateNotes: m.androidUpdateNotes || null,
    androidReleaseRepo: m.androidReleaseRepo || null,
    shopInfo: m.shopInfo || null,
    instagramUrl: m.instagramUrl || null,
    ownerEmailAlerts: bool(m.ownerEmailAlerts, DEFAULTS.ownerEmailAlerts),
    autoStartLensWork: bool(m.autoStartLensWork, DEFAULTS.autoStartLensWork),
    autoApproveTypedRx: bool(m.autoApproveTypedRx, DEFAULTS.autoApproveTypedRx),
    eyeTestEnabled: bool(m.eyeTestEnabled, DEFAULTS.eyeTestEnabled),
    frameOnlyToQc: bool(m.frameOnlyToQc, DEFAULTS.frameOnlyToQc),
    loyaltyEnabled: bool(m.loyaltyEnabled, DEFAULTS.loyaltyEnabled),
    loyaltyPointsPer100: m.loyaltyPointsPer100 ? Number(m.loyaltyPointsPer100) : DEFAULTS.loyaltyPointsPer100,
    loyaltyMaxRedeemPercent: m.loyaltyMaxRedeemPercent ? Number(m.loyaltyMaxRedeemPercent) : DEFAULTS.loyaltyMaxRedeemPercent,
    reviewsAutoApprove: bool(m.reviewsAutoApprove, DEFAULTS.reviewsAutoApprove),
  };
  cache = { at: Date.now(), v };
  return v;
}

export async function saveSettings(p: Partial<ShopSettings>) {
  for (const [key, val] of Object.entries(p)) {
    if (val === undefined) continue;
    const value = val === null ? '' : String(val);
    await prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
  }
  cache = null;
  return getSettings();
}

export const upiManualAvailable = (s: ShopSettings) => !!(s.upiId || s.upiQrImage);

/** Standard UPI payment link. Any UPI app opens it with payee, amount and note filled in. */
export function upiUri(s: ShopSettings, amountPaise: number, orderNumber: string) {
  if (!s.upiId) return null;
  // Personal UPI IDs: keep to pa/pn/am/cu/tn. Merchant-only fields (tr, mc) can make some apps decline the payment.
  const enc = (v: string) => encodeURIComponent(v).replace(/%40/g, '@');
  const q = [['pa', s.upiId], ['pn', s.upiPayeeName], ['am', (amountPaise / 100).toFixed(2)], ['cu', 'INR'], ['tn', `Lensio ${orderNumber}`]];
  return 'upi://pay?' + q.map(([k, v]) => `${k}=${enc(v)}`).join('&');
}

/** Payment details the app shows for an unpaid manual-UPI order. */
export async function upiPaymentInfo(amountPaise: number, orderNumber: string) {
  const s = await getSettings();
  const uri = upiUri(s, amountPaise, orderNumber);
  return {
    upiId: s.upiId, payeeName: s.upiPayeeName, amount: amountPaise, uri,
    // With a UPI ID we generate a QR with the exact amount; otherwise show the shop's uploaded QR.
    qrImage: uri ? await QRCode.toDataURL(uri, { margin: 1, width: 480, errorCorrectionLevel: 'M' }) : s.upiQrImage,
    amountPrefilled: !!uri,
  };
}
