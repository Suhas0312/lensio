import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { Address, PaymentMethod, PaymentOptions, RazorpayInit } from '@/api/types';
import { payWithRazorpay } from '@/lib/payments';
import { Button, Card, Field, OptionCard, Row, Screen, Text } from '@/components/UI';
import { colors, space } from '@/theme';
import { inr } from '@/lib/format';

const METHODS: { m: PaymentMethod; title: string; sub: string; needs: 'razorpay' | 'upiManual' | 'cod' }[] = [
  { m: 'UPI_MANUAL', title: 'Pay by UPI', sub: 'Scan our QR or pay from Google Pay, PhonePe, Paytm', needs: 'upiManual' },
  { m: 'UPI', title: 'UPI', sub: 'Google Pay, PhonePe, Paytm or any UPI app', needs: 'razorpay' },
  { m: 'CARD', title: 'Card', sub: 'Debit or credit card', needs: 'razorpay' },
  { m: 'NETBANKING', title: 'Net banking', sub: 'All major Indian banks', needs: 'razorpay' },
  { m: 'COD', title: 'Cash on delivery', sub: 'Pay when it arrives. ₹49 handling fee.', needs: 'cod' },
];

export default function Checkout() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<string>();
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [coupon, setCoupon] = useState('');
  const [applied, setApplied] = useState<string | null>(null);
  const [usePoints, setUsePoints] = useState(false);
  const [gcInput, setGcInput] = useState('');
  const [giftCard, setGiftCard] = useState<string | null>(null);
  const [q, setQ] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [opts, setOpts] = useState<PaymentOptions | null>(null);

  useEffect(() => {
    api<{ payments: PaymentOptions }>('/config').then((c) => {
      setOpts(c.payments);
      const first = METHODS.find((x) => c.payments[x.needs]);
      if (first) setMethod(first.m);
    }).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => {
    api<Address[]>('/auth/addresses').then((a) => { setAddresses(a); setAddressId((cur) => cur ?? a.find((x) => x.isDefault)?.id ?? a[0]?.id); });
  }, []));
  useEffect(() => {
    const p = new URLSearchParams({ paymentMethod: method, usePoints: String(usePoints), ...(applied ? { coupon: applied } : {}), ...(giftCard ? { giftCard } : {}) });
    api(`/cart?${p}`).then(setQ).catch((e) => Alert.alert('Could not load your total', (e as ApiError).message));
  }, [method, applied, usePoints, giftCard]);

  const place = async () => {
    if (!addressId) { router.push('/address/new'); return; }
    setBusy(true);
    try {
      const r = await api<{ order: { id: string }; payment: RazorpayInit | null }>('/orders/checkout', { body: { addressId, paymentMethod: method, couponCode: applied, giftCardCode: giftCard, usePoints } });
      if (r.payment) {
        const ok = await payWithRazorpay(r.payment, method);
        if (!ok) Alert.alert('Payment not completed', 'Your order is saved for 30 minutes. You can pay from the order page, or choose Cash on Delivery.');
      }
      router.replace(`/order/${r.order.id}`);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'PHONE_NOT_VERIFIED') {
        Alert.alert('Verify your mobile number', err.message, [
          { text: 'Pay by UPI instead', style: 'cancel' },
          { text: 'Verify now', onPress: () => router.push('/(tabs)/account') },
        ]);
      } else Alert.alert('Could not place order', err.message);
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={
      <View style={{ gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>To pay</Text><Text v="title">{q ? inr(q.total) : '—'}</Text></Row>
        <Button title={!addressId ? 'Add delivery address to continue' : method === 'COD' || method === 'UPI_MANUAL' || q?.total === 0 ? 'Place order' : `Pay ${q ? inr(q.total) : ''}`} onPress={place} loading={busy} disabled={!!addressId && !q} />
      </View>
    }>
      <Text v="title">Deliver to</Text>
      {addresses.length === 0 ? (
        <Card><Text>Add the address where we should deliver your glasses. Our delivery partner will call the mobile number you give.</Text></Card>
      ) : null}
      {addresses.map((a) => (
        <View key={a.id}>
          <OptionCard title={a.fullName} subtitle={`${a.line1}${a.line2 ? ', ' + a.line2 : ''}${a.landmark ? ', near ' + a.landmark : ''}, ${a.city} ${a.pincode}\n📞 ${a.phone}${a.altPhone ? ' · ' + a.altPhone : ''}`}
            selected={addressId === a.id} onPress={() => setAddressId(a.id)} />
          <Pressable onPress={() => router.push({ pathname: '/address/new', params: { id: a.id } })} style={{ alignSelf: 'flex-end', paddingVertical: space(1.5), paddingHorizontal: space(2) }} accessibilityRole="button">
            <Text v="caption" color={colors.cyan}>Edit</Text>
          </Pressable>
        </View>
      ))}
      <Button kind="secondary" title={addresses.length ? 'Add a new address' : 'Add delivery address'} onPress={() => router.push('/address/new')} />

      <Text v="title">Payment</Text>
      {METHODS.filter((x) => opts?.[x.needs] && (x.m !== 'COD' || q?.codAvailable !== false)).map((x) => (
        <OptionCard key={x.m} title={x.title} subtitle={x.sub} selected={method === x.m} onPress={() => setMethod(x.m)} />
      ))}

      {opts && !opts.upiManual && !opts.razorpay && !opts.cod ? <Text color={colors.warning}>Payments aren't set up yet. Chat with us on WhatsApp to order.</Text> : null}
      <Card>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Coupon code" value={coupon} onChangeText={(t) => setCoupon(t.toUpperCase())} placeholder="FIRST10" autoCapitalize="characters"
            error={applied && q?.couponError ? q.couponError : undefined} /></View>
          <Pressable onPress={() => setApplied(coupon || null)} style={{ paddingBottom: space(3.5) }}><Text v="bodyStrong" color={colors.cyan}>Apply</Text></Pressable>
        </Row>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Gift card" value={gcInput} onChangeText={(t) => setGcInput(t.toUpperCase())} placeholder="LENS-XXXX-XXXX" autoCapitalize="characters"
            error={giftCard && q?.giftCardError ? q.giftCardError : undefined} /></View>
          <Pressable onPress={() => setGiftCard(gcInput.trim() || null)} style={{ paddingBottom: space(3.5) }}><Text v="bodyStrong" color={colors.cyan}>Apply</Text></Pressable>
        </Row>
        <Pressable onPress={() => setUsePoints(!usePoints)} accessibilityRole="switch" accessibilityState={{ checked: usePoints }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(1) }}>
          <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: usePoints ? colors.violet : colors.line, padding: 3, alignItems: usePoints ? 'flex-end' : 'flex-start' }}>
            <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' }} />
          </View>
          <View style={{ flex: 1 }}>
            <Text v="bodyStrong">Use my Lensio points</Text>
            <Text v="caption" color={colors.muted}>{usePoints && q ? (q.pointsApplied ? `Using ${q.pointsApplied} of ${q.pointsAvailable} points` : q.pointsAvailable ? 'Points can cover part of this order' : "You don't have points yet. Earn them on every delivered order") : '1 point = ₹1 off'}</Text>
          </View>
        </Pressable>
        {q ? (
          <View style={{ gap: space(1.5) }}>
            <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Subtotal</Text><Text>{inr(q.subtotal)}</Text></Row>
            {q.discount ? <Row style={{ justifyContent: 'space-between' }}><Text color={colors.success}>{q.couponCode} applied</Text><Text color={colors.success}>−{inr(q.discount)}</Text></Row> : null}
            <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Delivery</Text><Text>{q.shippingFee ? inr(q.shippingFee) : 'Free'}</Text></Row>
            {q.codFee ? <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>COD handling</Text><Text>{inr(q.codFee)}</Text></Row> : null}
            {q.pointsAppliedPaise ? <Row style={{ justifyContent: 'space-between' }}><Text color={colors.success}>Lensio points</Text><Text color={colors.success}>−{inr(q.pointsAppliedPaise)}</Text></Row> : null}
            {q.giftCardApplied ? <Row style={{ justifyContent: 'space-between' }}><Text color={colors.success}>Gift card {q.giftCardCode}</Text><Text color={colors.success}>−{inr(q.giftCardApplied)}</Text></Row> : null}
            {q.giftCardApplied && q.giftCardBalance > q.giftCardApplied ? <Text v="caption" color={colors.muted}>{inr(q.giftCardBalance - q.giftCardApplied)} stays on your gift card for next time.</Text> : null}
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
