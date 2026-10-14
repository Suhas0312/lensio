import { prisma } from '../../lib/prisma';
import { notifyOrderUpdate } from '../notifications/whatsapp.service';
import { alertOwner } from '../notifications/owner.service';
import { transition } from '../orders/orders.service';

/** Courier status → what the customer sees, whether to email them, and what it means for the order. */
const MAP: { match: RegExp; message: string; email?: boolean; problem?: boolean; delivered?: boolean }[] = [
  { match: /^rto|return(ed)? to origin/i, message: 'Parcel is being returned to us', problem: true },
  { match: /undelivered|not delivered|delivery (attempt(ed)? )?fail|customer (not available|unavailable)|address issue|refused/i, message: 'Delivery attempted: courier will try again', email: true, problem: true },
  { match: /lost|damaged|destroyed|misrouted/i, message: 'Problem with the shipment: we are looking into it', problem: true },
  { match: /cancel/i, message: 'Courier shipment cancelled', problem: true },
  { match: /^delivered/i, message: 'Delivered', delivered: true },
  { match: /out for delivery/i, message: 'Out for delivery', email: true },
  { match: /reached|arrived|destination|hub/i, message: 'Reached a courier hub near you' },
  { match: /in transit|shipped|dispatched|forwarded|bagged|departed/i, message: 'In transit' },
  { match: /picked( up)?|pickup (done|completed)|manifested/i, message: 'Picked up by the courier', email: true },
  { match: /pickup (scheduled|generated|queued)|awb assigned|out for pickup/i, message: 'Courier pickup scheduled' },
];

/**
 * Records one courier update for an order: adds it to live tracking (deduplicated), emails the
 * customer for key milestones, alerts the owner about problems, and marks the order delivered.
 */
export async function recordCourierStatus(orderId: string, raw: { status?: string; activity?: string; location?: string | null; at?: Date }) {
  const order = await prisma.order.findUnique({ where: { id: orderId }, include: { user: true, address: true } });
  if (!order || order.status === 'CANCELLED') return;
  const text = `${raw.status ?? ''} ${raw.activity ?? ''}`.trim();
  if (!text) return;
  // The courier's status code decides first; the free-text activity is only used when there's no status.
  const rule = (raw.status ? MAP.find((m) => m.match.test(raw.status!)) : undefined) ?? MAP.find((m) => m.match.test(raw.activity ?? ''));
  const message = (rule?.message ?? (raw.activity || raw.status || '')).slice(0, 200);
  const location = raw.location?.slice(0, 100) || null;

  const recent = await prisma.trackingUpdate.findFirst({ where: { orderId, message, location }, orderBy: { at: 'desc' } });
  if (recent) return; // already recorded (webhooks and the backup check can both report the same scan)
  await prisma.trackingUpdate.create({ data: { orderId, message, location, source: 'courier', at: raw.at && !isNaN(raw.at.getTime()) ? raw.at : new Date() } });

  if (rule?.delivered) {
    if (order.status === 'DISPATCHED') await transition(order.id, 'DELIVERED', { note: 'Courier confirmed delivery', automated: true });
    return;
  }
  if (rule?.email) {
    void notifyOrderUpdate({ phone: order.address.phone, email: order.user.email, name: order.user.name, orderNumber: order.orderNumber,
      headline: message, detail: `${location ? `Location: ${location}. ` : ''}${order.trackingUrl ? `Track it: ${order.trackingUrl}` : 'Track it live in the Lensio app.'}` });
  }
  if (rule?.problem) {
    void alertOwner('courier_problem', `Courier problem · ${order.orderNumber}`,
      [`Status: ${raw.status || raw.activity}`, location ? `Location: ${location}` : '', order.awbCode ? `Tracking number: ${order.awbCode}` : '', 'Check the shipment in your Shiprocket dashboard.'].filter(Boolean), order.id);
  }
}
