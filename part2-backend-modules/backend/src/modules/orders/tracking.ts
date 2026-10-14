import { OrderStatus } from '@prisma/client';

const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (d: Date) => d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Delivery estimate shown on the tracking screen.
 * Frame-only orders: about 4 days. With prescription lenses: about 7 days from when lens work can start.
 */
export function estimateDelivery(o: { status: OrderStatus; createdAt: Date; updatedAt: Date; needsPrescription: boolean; items?: { lensPackageId: string | null; prescriptionId: string | null }[] })
  : { date: Date; text: string } | null {
  if (o.status === 'DELIVERED' || o.status === 'CANCELLED' || o.status === 'PAYMENT_PENDING') return null;
  const waitingRx = o.status === 'PLACED' && !!o.items?.some((i) => i.lensPackageId && !i.prescriptionId);
  if (waitingRx) return { date: addDays(new Date(), 7), text: 'about 7 days after we receive your prescription' };
  const days = o.needsPrescription ? 7 : 4;
  let date = addDays(o.createdAt, days);
  const remaining: Partial<Record<OrderStatus, number>> = { QUALITY_CHECK: 3, DISPATCHED: 2 };
  const min = remaining[o.status];
  if (min !== undefined) { const floor = addDays(o.updatedAt, min); if (floor > date) date = floor; }
  if (date < new Date()) date = addDays(new Date(), 1); // running late: never show a date in the past
  const lo = addDays(date, -1);
  return { date, text: `${fmt(lo)} – ${fmt(date)}` };
}
