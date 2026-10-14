import crypto from 'crypto';
import Razorpay from 'razorpay';
import { env } from '../../config/env';
import { AppError } from '../../lib/errors';

let client: Razorpay | null = null;
export function rzp(): Razorpay {
  if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET)
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not set up yet. Choose Cash on Delivery.');
  client ??= new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET });
  return client;
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  const o = await rzp().orders.create({ amount: amountPaise, currency: 'INR', receipt, notes });
  return o.id as string;
}

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET ?? '').update(`${orderId}|${paymentId}`).digest('hex');
  return safeEq(expected, signature);
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEq(expected, signature);
}

export async function refundPayment(paymentId: string, amountPaise?: number) {
  return rzp().payments.refund(paymentId, amountPaise ? { amount: amountPaise } : {});
}
