import { Image, Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/api/types';
import { inr, titleCase } from '@/lib/format';
import { useWishlist } from '@/store/shopping';
import { colors, radius, space } from '@/theme';
import { Text } from './UI';

/** List layout: one frame per row with its key details (Shop → list view). */
export function ProductRow({ p, onQuickView }: { p: Product; onQuickView?: (p: Product) => void }) {
  const off = p.mrp > p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0;
  const colours = [...new Map((p.variants ?? []).map((v) => [v.colorHex, v])).values()].slice(0, 6);
  const liked = useWishlist((s) => s.ids.has(p.id)), toggleLike = useWishlist((s) => s.toggle);
  return (
    <Pressable onPress={() => router.push(`/product/${p.slug}`)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.basePrice)}`}
      style={({ pressed }) => ({ flexDirection: 'row', gap: space(3), padding: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', backgroundColor: 'rgba(21,27,77,0.62)', opacity: pressed ? 0.9 : 1 })}>
      <View style={{ width: 120, aspectRatio: 1.25, backgroundColor: '#F4F5FB', borderRadius: radius.sm, overflow: 'hidden', justifyContent: 'center' }}>
        {p.images?.[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text v="bodyStrong" numberOfLines={2}>{p.name}</Text>
        <Text v="caption" color={colors.muted}>{titleCase(p.shape)} · {titleCase(p.material)}{p.isSunglasses ? ' · Sunglasses' : ''} · {p.lensWidthMm}-{p.bridgeMm}-{p.templeMm}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' }}>
          <Text v="bodyStrong">{inr(p.basePrice)}</Text>
          {off ? <Text v="caption" color={colors.faint} style={{ textDecorationLine: 'line-through' }}>{inr(p.mrp)}</Text> : null}
          {off ? <Text v="caption" color={colors.success}>{off}% off</Text> : null}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {colours.map((v) => <View key={v.colorHex} style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: v.colorHex, borderWidth: 1, borderColor: colors.line }} />)}
          {p.ratingCount ? <Text v="caption" color={colors.muted} style={{ marginLeft: 'auto' }}>★ {p.rating.toFixed(1)}</Text> : null}
        </View>
      </View>
      <View style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Pressable onPress={() => toggleLike(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Remove from wishlist' : 'Save to wishlist'}>
          <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? '#e11d48' : colors.text} />
        </Pressable>
        {onQuickView ? <Pressable onPress={() => onQuickView(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Quick view ${p.name}`}><Ionicons name="eye-outline" size={22} color={colors.cyan} /></Pressable> : null}
      </View>
    </Pressable>
  );
}
