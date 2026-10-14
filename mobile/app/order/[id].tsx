import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Linking, RefreshControl, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { RazorpayInit } from '@/api/types';
import { Button, Card, Loading, Row, Text } from '@/components/UI';
import { Timeline } from '@/components/Timeline';
import { UpiPay } from '@/components/UpiPay';
import { FollowInstagram } from '@/components/FollowInstagram';
import { colors, space } from '@/theme';
import { dateTime, inr, titleCase } from '@/lib/format';
import { payWithRazorpay } from '@/lib/payments';
import { webColumn } from '@/lib/layout';

export default function OrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [o, setO] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [justChanged, setJustChanged] = useState(false);
  const lastStatus = useRef<string | null>(null);

  const fetchOrder = useCallback(async (quiet: boolean) => {
    if (!quiet) setLoading(true);
    try {
      const next = await api(`/orders/${id}`);
      if (lastStatus.current && lastStatus.current !== next.status) { setJustChanged(true); setTimeout(() => setJustChanged(false), 6000); }
      lastStatus.current = next.status;
      setO(next); setUpdatedAt(new Date());
    } catch { /* keep showing the last known state; the next refresh will retry */ }
    finally { if (!quiet) setLoading(false); }
  }, [id]);
  const load = useCallback(() => fetchOrder(false), [fetchOrder]);

  // Live tracking: refresh every 20 s while this screen is open and the order is still moving.
  const live = !!o && !['DELIVERED', 'CANCELLED'].includes(o.status);
  useFocusEffect(useCallback(() => {
    fetchOrder(false);
    const t = setInterval(() => fetchOrder(true), 20_000);
    return () => clearInterval(t);
  }, [fetchOrder]));
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!live) return;
    const a = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.3, duration: 900, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
    ]));
    a.start(); return () => a.stop();
  }, [live, pulse]);

  if (!o) return <Loading />;

  const payNow = async () => {
    try {
      const init = await api<RazorpayInit>(`/orders/${o.id}/pay`, { body: {} });
      if (await payWithRazorpay(init)) load();
    } catch (e) { Alert.alert('Payment', (e as ApiError).message); }
  };
  const cancel = () => Alert.alert('Cancel this order?', 'Any payment will be refunded to the original method in 5–7 working days.', [
    { text: 'Keep order', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: async () => {
      try { await api(`/orders/${o.id}/cancel`, { body: {} }); load(); } catch (e) { Alert.alert('Could not cancel', (e as ApiError).message); }
    } },
  ]);

  return (
    <ScrollView style={{ backgroundColor: colors.night }} contentContainerStyle={[{ padding: space(5), gap: space(4), paddingBottom: space(12) }, webColumn()]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.violet} />}>
      <View style={{ gap: 2 }}>
        <Text v="heading">{o.statusLabel}</Text>
        <Text v="caption" color={colors.muted}>Order {o.orderNumber} · placed {dateTime(o.createdAt)}</Text>
        {live ? (
          <Row style={{ gap: space(2), marginTop: space(1) }}>
            <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success, opacity: pulse }} />
            <Text v="caption" color={justChanged ? colors.success : colors.muted}>
              {justChanged ? 'Just updated!' : `Live · checked ${updatedAt ? updatedAt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : ''}`}
            </Text>
          </Row>
        ) : null}
      </View>

      {o.eta ? (
        <Card style={{ borderColor: colors.cyan }}>
          <Row>
            <Ionicons name="calendar-outline" size={24} color={colors.cyan} />
            <View style={{ flex: 1 }}>
              <Text v="caption" color={colors.muted}>Estimated delivery</Text>
              <Text v="title">{o.eta.text}</Text>
            </View>
          </Row>
        </Card>
      ) : null}

      {o.upi ? <UpiPay orderId={o.id} orderNumber={o.orderNumber} upi={o.upi} onSubmitted={load} /> : null}

      {o.status === 'PAYMENT_PENDING' && o.paymentMethod !== 'UPI_MANUAL' ? (
        <Card style={{ borderColor: colors.warning }}>
          <Text>Payment not received yet. We're holding your frame until {o.holdExpiresAt ? dateTime(o.holdExpiresAt) : 'soon'}.</Text>
          <Button title={`Pay ${inr(o.total)}`} onPress={payNow} />
        </Card>
      ) : null}

      {o.items.filter((i: any) => i.needsRxUpload).map((i: any) => (
        <Card key={i.id} style={{ borderColor: colors.cyan }}>
          <Text v="bodyStrong">Send your prescription for {i.productName}</Text>
          <Text v="caption" color={colors.muted}>We start cutting your lenses as soon as our optician verifies it.</Text>
          <Button title="Add prescription" onPress={() => router.push({ pathname: '/prescription/new', params: { orderId: o.id, itemId: i.id, lensType: i.lensPackage?.lensType } })} />
        </Card>
      ))}

      {o.status === 'CANCELLED'
        ? <Card><Text>This order was cancelled.</Text></Card>
        : <Card><Timeline stages={o.timeline} /></Card>}

      {o.tracking?.length || o.awbCode ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="title">Shipping updates</Text>
            {o.courierName ? <Text v="caption" color={colors.muted}>{o.courierName}{o.awbCode ? ` · ${o.awbCode}` : ''}</Text> : null}
          </Row>
          {(o.tracking ?? []).map((t: any, i: number) => (
            <Row key={t.id} style={{ alignItems: 'flex-start' }}>
              <View style={{ alignItems: 'center', width: 14, paddingTop: 5 }}>
                <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: i === 0 ? colors.cyan : colors.line }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text v={i === 0 ? 'bodyStrong' : 'body'} color={i === 0 ? colors.text : colors.muted}>{t.message}</Text>
                <Text v="caption" color={colors.faint}>{t.location ? `${t.location} · ` : ''}{dateTime(t.at)}</Text>
              </View>
            </Row>
          ))}
          {!o.tracking?.length ? <Text v="caption" color={colors.muted}>Courier updates will appear here.</Text> : null}
        </Card>
      ) : null}

      {o.trackingUrl ? <Button kind="secondary" title={`Track on ${o.courierName ?? 'courier'} website`} onPress={() => Linking.openURL(o.trackingUrl)} /> : null}

      <Card>
        <Text v="title">Items</Text>
        {o.items.map((i: any) => (
          <View key={i.id} style={{ gap: 2 }}>
            <Row style={{ justifyContent: 'space-between' }}><Text v="bodyStrong">{i.productName}</Text><Text>{inr(i.unitPrice * i.quantity)}</Text></Row>
            <Text v="caption" color={colors.muted}>{i.variantLabel} · {i.lensPackage?.name ?? 'Frame only'}{i.coatingCodes.length ? ` + ${i.coatingCodes.map(titleCase).join(', ')}` : ''}</Text>
            {i.prescription ? <Text v="caption" color={i.prescription.status === 'VERIFIED' ? colors.success : colors.warning}>
              Prescription {i.prescription.status === 'VERIFIED' ? 'verified' : i.prescription.status === 'REJECTED' ? 'unreadable — upload a clearer copy' : 'being checked'}</Text> : null}
          </View>
        ))}
        <View style={{ height: 1, backgroundColor: colors.line }} />
        {o.discount ? <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Discount</Text><Text color={colors.success}>−{inr(o.discount)}</Text></Row> : null}
        <Row style={{ justifyContent: 'space-between' }}><Text v="bodyStrong">Total</Text><Text v="bodyStrong">{inr(o.total)}</Text></Row>
        <Text v="caption" color={colors.muted}>{o.paymentMethod === 'COD' ? 'Pay by cash on delivery' : o.paymentMethod === 'UPI_MANUAL' ? 'Paid by UPI' : `Paid by ${titleCase(o.paymentMethod)}`}</Text>
        {o.pointsUsed ? <Text v="caption" color={colors.success}>{inr(o.pointsUsed)} paid with Lensio points</Text> : null}
        {o.giftCardUsed ? <Text v="caption" color={colors.success}>{inr(o.giftCardUsed)} paid with a gift card</Text> : null}
        {o.pointsEarned && o.status !== 'CANCELLED' ? (
          <Text v="caption" color={colors.cyan}>⭐ {o.status === 'DELIVERED' ? `You earned ${o.pointsEarned} Lensio points` : `You'll earn ${o.pointsEarned} Lensio points when this is delivered`}</Text>
        ) : null}
      </Card>

      {o.status === 'DELIVERED' ? (
        <Card>
          <Text v="title">How are your new glasses?</Text>
          <Text v="caption" color={colors.muted}>Your review helps other shoppers choose.</Text>
          {[...new Map(o.items.map((i: any) => [i.variant?.product?.id, i])).values()].filter((i: any) => i.variant?.product?.id).map((i: any) => (
            <Button key={i.id} kind="secondary" title={`★ Rate ${i.productName}`}
              onPress={() => router.push({ pathname: '/review/new', params: { productId: i.variant.product.id, orderId: o.id, name: i.productName } })} />
          ))}
        </Card>
      ) : null}

      {o.status !== 'CANCELLED' && o.status !== 'PAYMENT_PENDING' ? (
        <FollowInstagram title={o.status === 'DELIVERED' ? 'Share your new look' : 'While you wait, follow us'} subtitle={o.status === 'DELIVERED' ? 'Tag us in your photos' : 'See new frames and offers first'} />
      ) : null}
      <Button kind="secondary" title="Chat with us on WhatsApp" onPress={() => Linking.openURL(o.supportWhatsApp)} />
      {o.canCancel ? <Button kind="ghost" title="Cancel order" onPress={cancel} /> : null}
    </ScrollView>
  );
}
