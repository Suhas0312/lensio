import { useCallback, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Card, Empty, Loading, Row, Screen, Text } from '@/components/UI';
import { colors, radius, space } from '@/theme';
import { inr, titleCase } from '@/lib/format';

export default function Cart() {
  const user = useAuth((s) => s.user);
  const [q, setQ] = useState<any>(null);
  const load = useCallback(() => { if (user) api('/cart').then(setQ); }, [user]);
  useFocusEffect(load);

  if (!user) return <Screen><Empty title="Sign in to see your cart" action={<Button title="Sign in" onPress={() => router.push('/(auth)/login')} />} /></Screen>;
  if (!q) return <Loading />;
  if (!q.lines.length) return <Screen><Empty title="Your cart is empty" body="Pick a frame, then choose lenses to match your prescription." action={<Button title="Shop frames" onPress={() => router.push('/shop')} />} /></Screen>;

  return (
    <Screen footer={
      <View style={{ gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Total</Text><Text v="title">{inr(q.total)}</Text></Row>
        <Button title="Checkout" onPress={() => router.push('/checkout')} disabled={q.blocking.length > 0} />
      </View>
    }>
      {q.lines.map((l: any) => (
        <Card key={l.id}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 84, height: 64, borderRadius: radius.sm, backgroundColor: '#F4F5FB' }}>
              {l.variant.product.images[0] ? <Image source={{ uri: l.variant.product.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text v="bodyStrong">{l.variant.product.name}</Text>
              <Text v="caption" color={colors.muted}>{l.variant.colorName} · {titleCase(l.variant.size)}</Text>
              <Text v="caption" color={colors.muted}>{l.lensPackage ? l.lensPackage.name : 'Frame only'}{l.coatingCodes.length ? ` + ${l.coatingCodes.map(titleCase).join(', ')}` : ''}</Text>
              {l.sendRxLater ? <Text v="caption" color={colors.warning}>Prescription: send after ordering</Text> : null}
              {l.issues.map((i: string) => <Text key={i} v="caption" color={colors.danger}>{i}</Text>)}
            </View>
            <Text v="bodyStrong">{inr(l.lineTotal)}</Text>
          </Row>
          <Pressable onPress={() => api(`/cart/items/${l.id}`, { method: 'DELETE' }).then(load)} style={{ alignSelf: 'flex-end' }}>
            <Text v="caption" color={colors.muted}>Remove</Text>
          </Pressable>
        </Card>
      ))}
      <Card>
        <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Subtotal</Text><Text>{inr(q.subtotal)}</Text></Row>
        <Row style={{ justifyContent: 'space-between' }}><Text color={colors.muted}>Delivery</Text><Text>{q.shippingFee ? inr(q.shippingFee) : 'Free'}</Text></Row>
      </Card>
    </Screen>
  );
}
