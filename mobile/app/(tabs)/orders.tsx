import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Empty, Text } from '@/components/UI';
import { colors, radius, space } from '@/theme';
import { dateTime, inr } from '@/lib/format';
import { webColumn } from '@/lib/layout';

export default function Orders() {
  const user = useAuth((s) => s.user);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try { setOrders(await api('/orders')); } finally { setLoading(false); }
  }, [user]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!user) return <View style={{ flex: 1, backgroundColor: colors.night, padding: space(5) }}>
    <Empty title="Track your orders here" body="Sign in to see your orders and their progress." action={<Button title="Sign in" onPress={() => router.push('/(auth)/login')} />} />
  </View>;

  return (
    <FlatList style={{ backgroundColor: colors.night }} contentContainerStyle={[{ padding: space(5), gap: space(3) }, webColumn()]}
      data={orders} keyExtractor={(o) => o.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.violet} />}
      ListEmptyComponent={loading ? null : <Empty title="No orders yet" body="Your orders will show up here." action={<Button title="Shop frames" onPress={() => router.push('/shop')} />} />}
      renderItem={({ item: o }) => (
        <Pressable onPress={() => router.push(`/order/${o.id}`)} style={{ flexDirection: 'row', gap: space(3), padding: space(4), backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line }}>
          <View style={{ width: 72, height: 56, borderRadius: radius.sm, backgroundColor: '#F4F5FB', justifyContent: 'center' }}>
            {o.items[0]?.variant?.product?.images?.[0] ? <Image source={{ uri: o.items[0].variant.product.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text v="bodyStrong">{o.statusLabel}</Text>
            <Text v="caption" color={colors.muted}>{o.orderNumber} · {dateTime(o.createdAt)}</Text>
            <Text v="caption" color={colors.muted}>{o.items.length} item{o.items.length > 1 ? 's' : ''} · {inr(o.total)}</Text>
          </View>
        </Pressable>
      )} />
  );
}
