import { useCallback, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Card, Field, Loading, Row, Screen, Text } from '@/components/UI';
import { colors, gradient, radius, space } from '@/theme';
import { dateTime, inr } from '@/lib/format';

interface Me { enabled: boolean; balance: number; pointsPer100: number; maxRedeemPercent: number; history: { id: string; points: number; label: string; orderNumber: string | null; at: string }[] }
interface Pending { productId: string; productName: string; productImage: string | null; orderId: string; orderNumber: string }

/** Lensio Rewards: points balance and history, gift card balance, and frames waiting for a review. */
export default function Rewards() {
  const user = useAuth((s) => s.user);
  const [me, setMe] = useState<Me | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [code, setCode] = useState('');
  const [gc, setGc] = useState<string | null>(null);
  const [gcErr, setGcErr] = useState<string>();

  useFocusEffect(useCallback(() => {
    if (!user) return;
    api<Me>('/loyalty/me').then(setMe).catch(() => {});
    api<Pending[]>('/reviews/pending').then(setPending).catch(() => {});
  }, [user]));

  if (!user) return <Screen><Card><Text v="title">Sign in to see your rewards</Text><Button title="Sign in" onPress={() => router.push('/(auth)/login')} /></Card></Screen>;
  if (!me) return <Loading />;

  const check = async () => {
    setGc(null); setGcErr(undefined);
    try { const r = await api<{ code: string; balance: number; expiresAt: string | null }>(`/loyalty/giftcard/${encodeURIComponent(code.trim())}`); setGc(`${r.code}: ${inr(r.balance)} left${r.expiresAt ? ` · valid until ${new Date(r.expiresAt).toLocaleDateString('en-IN')}` : ''}`); }
    catch (e) { setGcErr((e as ApiError).message); }
  };

  return (
    <Screen>
      <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: space(5), gap: space(1) }}>
        <Text v="caption" color="#fff">Your Lensio points</Text>
        <Text style={{ fontSize: 40, fontWeight: '700', color: '#fff' }}>{me.balance}</Text>
        <Text color="#fff">Worth {inr(me.balance * 100)} off your next order</Text>
      </LinearGradient>

      <Card>
        <Text v="title">How it works</Text>
        <Text color={colors.muted}>• Earn <Text v="bodyStrong">{me.pointsPer100} points for every ₹100</Text> you spend. Points are added when your order is delivered.</Text>
        <Text color={colors.muted}>• 1 point = ₹1. At checkout, switch on <Text v="bodyStrong">Use my Lensio points</Text> to pay for up to {me.maxRedeemPercent}% of an order.</Text>
        <Text color={colors.muted}>• Points used on a cancelled order are returned to you.</Text>
      </Card>

      {pending.length ? (
        <Card>
          <Text v="title">Rate your frames</Text>
          {pending.slice(0, 5).map((p) => (
            <Pressable key={`${p.productId}:${p.orderId}`} onPress={() => router.push({ pathname: '/review/new', params: { productId: p.productId, orderId: p.orderId, name: p.productName } })}>
              <Row>
                <View style={{ width: 56, height: 44, borderRadius: radius.sm, backgroundColor: '#F4F5FB', overflow: 'hidden' }}>
                  {p.productImage ? <Image source={{ uri: p.productImage }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
                </View>
                <View style={{ flex: 1 }}><Text v="bodyStrong">{p.productName}</Text><Text v="caption" color={colors.muted}>Order {p.orderNumber}</Text></View>
                <Text color="#F5A524">★ Rate</Text>
              </Row>
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <Text v="title">Gift card balance</Text>
        <Row style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}><Field label="Gift card code" value={code} onChangeText={(t) => setCode(t.toUpperCase())} placeholder="LENS-XXXX-XXXX" autoCapitalize="characters" error={gcErr} /></View>
          <Pressable onPress={check} disabled={!code.trim()} style={{ paddingBottom: space(3.5) }}><Text v="bodyStrong" color={colors.cyan}>Check</Text></Pressable>
        </Row>
        {gc ? <Text color={colors.success}>{gc}</Text> : null}
        <Text v="caption" color={colors.faint}>Use your gift card at checkout. Any balance left stays on the card.</Text>
      </Card>

      <Card>
        <Text v="title">Points history</Text>
        {me.history.length ? me.history.map((h) => (
          <Row key={h.id} style={{ justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}><Text>{h.label}</Text><Text v="caption" color={colors.faint}>{h.orderNumber ? `${h.orderNumber} · ` : ''}{dateTime(h.at)}</Text></View>
            <Text v="bodyStrong" color={h.points > 0 ? colors.success : colors.muted}>{h.points > 0 ? '+' : ''}{h.points}</Text>
          </Row>
        )) : <Text color={colors.muted}>No points yet. Place an order to start earning.</Text>}
      </Card>
    </Screen>
  );
}
