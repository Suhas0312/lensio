import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Product } from '@/api/types';
import { colors, radius, space } from '@/theme';
import { inr } from '@/lib/format';
import { Text } from './UI';

export function ProductCard({ p, width }: { p: Product; width: number }) {
  const colorsAvail = [...new Map(p.variants.map((v) => [v.colorHex, v])).values()].slice(0, 4);
  const off = p.mrp > p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0;
  return (
    <Pressable onPress={() => router.push(`/product/${p.slug}`)} style={{ width, gap: space(2) }} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.basePrice)}`}>
      <View style={{ backgroundColor: '#F4F5FB', borderRadius: radius.md, aspectRatio: 1.25, overflow: 'hidden', justifyContent: 'center' }}>
        {p.images[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
      </View>
      <Text v="bodyStrong" numberOfLines={1}>{p.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
        <Text v="bodyStrong">{inr(p.basePrice)}</Text>
        {off ? <Text v="caption" color={colors.faint} style={{ textDecorationLine: 'line-through' }}>{inr(p.mrp)}</Text> : null}
        {off ? <Text v="caption" color={colors.success}>{off}% off</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {colorsAvail.map((v) => <View key={v.colorHex} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: v.colorHex, borderWidth: 1, borderColor: colors.line }} />)}
      </View>
    </Pressable>
  );
}
