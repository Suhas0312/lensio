import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { cachedApi, qs } from '@/api/client';
import { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { Text } from '@/components/UI';
import { space } from '@/theme';

/** Product page → "Similar frames": same shape (and type), excluding the one being viewed. */
export function SimilarFrames({ p }: { p: Product }) {
  const [items, setItems] = useState<Product[]>([]);
  useEffect(() => {
    const path = '/catalog/products' + qs({ shape: p.shape, sunglasses: String(!!p.isSunglasses), exclude: p.id, limit: 10 });
    const set = (r: { items: Product[] }) => setItems(r.items);
    cachedApi<{ items: Product[] }>(path, set).then(set).catch(() => {});
  }, [p.id, p.shape, p.isSunglasses]);
  if (!items.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <Text v="title">Similar frames</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {items.map((x) => <ProductCard key={x.id} p={x} width={160} />)}
      </ScrollView>
    </View>
  );
}
