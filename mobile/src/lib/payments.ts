import RazorpayCheckout from 'react-native-razorpay';
import { api } from '@/api/client';
import { PaymentMethod, RazorpayInit } from '@/api/types';

/** Opens Razorpay checkout and verifies the result server-side. Exported for the order screen's "Pay now". */
export async function payWithRazorpay(init: RazorpayInit, method?: PaymentMethod): Promise<boolean> {
  try {
    const r = await RazorpayCheckout.open({
      key: init.keyId, order_id: init.razorpayOrderId, amount: init.amount, currency: init.currency,
      name: 'Lensio', description: 'Your lens, our world', prefill: init.prefill,
      theme: { color: '#7B61FF' }, ...(method && method !== 'COD' ? { method: method.toLowerCase() } : {}),
    } as any);
    await api('/payments/razorpay/verify', { body: r });
    return true;
  } catch (e: any) {
    // Covers user dismissal and failed UPI/card attempts. The order stays payable during its hold window.
    await api('/payments/razorpay/failed', { body: { razorpay_order_id: init.razorpayOrderId, reason: e?.description ?? e?.message } }).catch(() => {});
    return false;
  }
}

