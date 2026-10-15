import { useCallback, useState } from 'react';
import { FlatList, View } from 'react-native';
import { router, Stack, useFocusEffect } from 'expo-router';
import { cachedApi } from '@/api/client';
import { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { CompareBar } from '@/components/CompareBar';
import { Button, Empty, Loading } from '@/components/UI';
import { useLayout } from '@/lib/layout';
import { useAuth } from '@/store/auth';
import { useWishlist } from '@/store/shopping';
import { space } from '@/theme';

/** ♥ My wishlist: frames saved on the account. */
export default function Wishlist() {
  const user = useAuth((s) => s.user);
  const ids = useWishlist((s) => s.ids);
  const { cardW, cols, pad } = useLayout();
  const [items, setItems] = useState<Product[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!user) { setItems([]); return; }
    cachedApi<Product[]>('/catalog/wishlist', setItems).then(setItems).catch(() => setItems((x) => x ?? []));
  }, [user]));
  const list = (items ?? []).filter((p) => ids.has(p.id) || !useWishlist.getState().loaded);
  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'My wishlist' }} />
      {!user ? <Empty title="Save frames you love" body="Sign in, then tap ♥ on any frame." action={<Button title="Sign in" onPress={() => router.push('/(auth)/login')} />} />
        : items === null ? <Loading />
        : !list.length ? <Empty title="Your wishlist is empty" body="Tap ♥ on any frame to save it here." action={<Button title="Browse frames" onPress={() => router.replace('/(tabs)/shop')} />} />
        : <FlatList data={list} key={cols} numColumns={cols} keyExtractor={(p) => p.id}
            contentContainerStyle={{ padding: pad, gap: space(5), paddingBottom: 120 }} columnWrapperStyle={cols > 1 ? { gap: space(4) } : undefined}
            renderItem={({ item }) => <ProductCard p={item} width={cardW} />} />}
      <CompareBar />
    </View>
  );
}
