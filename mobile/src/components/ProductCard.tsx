import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/api/types';
import { colors, radius, space } from '@/theme';
import { inr } from '@/lib/format';
import { useCompare, useWishlist } from '@/store/shopping';
import { Text } from './UI';

/** Frame card: photo, ♥ wishlist and ⇄ compare buttons, price, discount and colours. */
export function ProductCard({ p, width }: { p: Product; width: number }) {
  const colorsAvail = [...new Map((p.variants ?? []).map((v) => [v.colorHex, v])).values()].slice(0, 4);
  const off = p.mrp > p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0;
  const liked = useWishlist((s) => s.ids.has(p.id)), toggleLike = useWishlist((s) => s.toggle);
  const comparing = useCompare((s) => s.items.some((x) => x.id === p.id)), toggleCompare = useCompare((s) => s.toggle);
  return (
    <Pressable onPress={() => router.push(`/product/${p.slug}`)} style={({ pressed }) => [{ width, gap: space(2) }, pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 }]} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.basePrice)}`}>
      <View style={{ backgroundColor: '#F4F5FB', borderRadius: radius.md, aspectRatio: 1.25, overflow: 'hidden', justifyContent: 'center' }}>
        {p.images?.[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
        {off >= 20 ? (
          <View style={{ position: 'absolute', left: 8, top: 8, backgroundColor: colors.success, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text v="caption" color="#04210f" style={{ fontWeight: '700' }}>{off}% OFF</Text>
          </View>
        ) : null}
        <View style={{ position: 'absolute', right: 6, top: 6, gap: 6 }}>
          <Pressable onPress={() => toggleLike(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Remove from wishlist' : 'Save to wishlist'}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={19} color={liked ? '#e11d48' : '#1B1F3B'} />
          </Pressable>
          <Pressable onPress={() => toggleCompare(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={comparing ? 'Remove from compare' : 'Add to compare'}
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: comparing ? colors.violet : 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="git-compare-outline" size={18} color={comparing ? '#fff' : '#1B1F3B'} />
          </Pressable>
        </View>
      </View>
      <Text v="bodyStrong" numberOfLines={1}>{p.name}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' }}>
        <Text v="bodyStrong">{inr(p.basePrice)}</Text>
        {off ? <Text v="caption" color={colors.faint} style={{ textDecorationLine: 'line-through' }}>{inr(p.mrp)}</Text> : null}
        {off && off < 20 ? <Text v="caption" color={colors.success}>{off}% off</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {colorsAvail.map((v) => <View key={v.colorHex} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: v.colorHex, borderWidth: 1, borderColor: colors.line }} />)}
        {p.ratingCount ? <Text v="caption" color={colors.muted} style={{ marginLeft: 'auto' }}>★ {p.rating.toFixed(1)}</Text> : null}
      </View>
    </Pressable>
  );
}
