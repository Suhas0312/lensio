import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../lib/errors';

const BASE = 'https://apiv2.shiprocket.in/v1/external';
let token: { value: string; exp: number } | null = null;

export const shiprocketEnabled = () => !!(env.SHIPROCKET_EMAIL && env.SHIPROCKET_PASSWORD);

async function auth(): Promise<string> {
  if (token && token.exp > Date.now()) return token.value;
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }),
  });
  if (!r.ok) throw new AppError(502, 'SHIPPING_AUTH', 'Shiprocket login failed');
  const j = (await r.json()) as { token: string };
  token = { value: j.token, exp: Date.now() + 9 * 24 * 3600_000 }; // tokens last 10 days
  return j.token;
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await auth()}` },
    body: JSON.stringify(body),
  });
  const j = (await r.json().catch(() => ({}))) as T;
  if (!r.ok) {
    logger.error({ path, status: r.status, j }, 'Shiprocket error');
    throw new AppError(502, 'SHIPPING_ERROR', 'Shiprocket request failed');
  }
  return j;
}

export interface ShipmentInput {
  orderNumber: string; createdAt: Date; isCod: boolean; total: number;
  address: { fullName: string; phone: string; altPhone?: string | null; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string };
  email?: string | null;
  items: { name: string; sku: string; units: number; unitPrice: number }[];
}

/** Creates the Shiprocket order, assigns an AWB and schedules pickup. */
export async function createShipment(s: ShipmentInput) {
  const [first, ...rest] = s.address.fullName.trim().split(/\s+/);
  const created = await call<{ order_id: number; shipment_id: number }>('/orders/create/adhoc', {
    order_id: s.orderNumber,
    order_date: s.createdAt.toISOString().slice(0, 16).replace('T', ' '),
    pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
    billing_customer_name: first, billing_last_name: rest.join(' ') || '.',
    billing_address: s.address.line1, billing_address_2: [s.address.line2, s.address.landmark ? `Near ${s.address.landmark}` : ''].filter(Boolean).join(', '),
    billing_city: s.address.city, billing_pincode: s.address.pincode, billing_state: s.address.state,
    billing_country: 'India', billing_email: s.email ?? 'orders@lensio.in', billing_phone: s.address.phone,
    ...(s.address.altPhone ? { billing_alternate_phone: s.address.altPhone } : {}),
    shipping_is_billing: true,
    order_items: s.items.map((i) => ({ name: i.name, sku: i.sku, units: i.units, selling_price: i.unitPrice / 100 })),
    payment_method: s.isCod ? 'COD' : 'Prepaid',
    sub_total: s.total / 100,
    // Standard spectacle box
    length: 18, breadth: 8, height: 6, weight: 0.3,
  });
  const awb = await call<{ response?: { data?: { awb_code?: string; courier_name?: string } } }>(
    '/courier/assign/awb', { shipment_id: created.shipment_id });
  const awbCode = awb.response?.data?.awb_code;
  if (awbCode) await call('/courier/generate/pickup', { shipment_id: [created.shipment_id] }).catch(() => undefined);
  return {
    shiprocketOrderId: String(created.order_id),
    awbCode: awbCode ?? null,
    courierName: awb.response?.data?.courier_name ?? null,
    trackingUrl: awbCode ? `https://shiprocket.co/tracking/${awbCode}` : null,
  };
}

/** Current tracking for an AWB (used as a backup when a webhook is missed). */
export async function trackAwb(awb: string): Promise<{ status: string; activities: { at: Date; activity: string; location: string | null }[] }> {
  const r = await fetch(`${BASE}/courier/track/awb/${encodeURIComponent(awb)}`, { headers: { Authorization: `Bearer ${await auth()}` } });
  const j = (await r.json().catch(() => ({}))) as {
    tracking_data?: { shipment_track?: { current_status?: string }[]; shipment_track_activities?: { date?: string; activity?: string; location?: string }[] };
  };
  if (!r.ok) throw new AppError(502, 'SHIPPING_ERROR', 'Shiprocket tracking failed');
  const t = j.tracking_data ?? {};
  return {
    status: String(t.shipment_track?.[0]?.current_status ?? ''),
    activities: (t.shipment_track_activities ?? []).map((a) => ({ at: a.date ? new Date(a.date) : new Date(), activity: String(a.activity ?? ''), location: a.location ? String(a.location) : null })),
  };
}
