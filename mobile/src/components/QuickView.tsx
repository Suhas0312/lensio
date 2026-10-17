import { Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/api/types';
import { inr, titleCase } from '@/lib/format';
import { useCompare, useWishlist } from '@/store/shopping';
import { colors, radius, space } from '@/theme';
import { Button, Text } from './UI';
import { useT } from '@/i18n';

/** Quick view: the key facts of a frame without leaving the list (photo, price, colours, sizes, size in mm). */
export function QuickView({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const { width } = useWindowDimensions();
  const t = useT();
  const liked = useWishlist((s) => (p ? s.ids.has(p.id) : false)), toggleLike = useWishlist((s) => s.toggle);
  const comparing = useCompare((s) => (p ? s.items.some((x) => x.id === p.id) : false)), toggleCompare = useCompare((s) => s.toggle);
  if (!p) return null;
  const off = p.mrp > p.basePrice ? Math.round((1 - p.basePrice / p.mrp) * 100) : 0;
  const colours = [...new Map((p.variants ?? []).map((v) => [v.colorHex, v])).values()];
  const sizes = [...new Set((p.variants ?? []).filter((v) => v.stock > 0).map((v) => v.size))];
  const inStock = (p.variants ?? []).some((v) => v.stock > 0);
  const go = (fn: () => void) => { onClose(); fn(); };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(2,3,20,0.7)', justifyContent: width >= 700 ? 'center' : 'flex-end', alignItems: 'center' }} accessibilityLabel="Close quick view">
        <Pressable onPress={() => {}} style={{ width: Math.min(width, 520), maxHeight: '90%', backgroundColor: colors.surface, borderRadius: radius.lg, borderBottomLeftRadius: width >= 700 ? radius.lg : 0, borderBottomRightRadius: width >= 700 ? radius.lg : 0, overflow: 'hidden' }}>
          <ScrollView contentContainerStyle={{ padding: space(5), gap: space(3) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text v="caption" color={colors.muted}>{t('quickView')}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close"><Ionicons name="close" size={24} color={colors.text} /></Pressable>
            </View>
            <View style={{ backgroundColor: '#F4F5FB', borderRadius: radius.md, aspectRatio: 1.6, overflow: 'hidden' }}>
              {p.images?.[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" accessibilityLabel={p.name} /> : null}
            </View>
            <Text v="heading">{p.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' }}>
              <Text v="title">{inr(p.basePrice)}</Text>
              {off ? <><Text color={colors.faint} style={{ textDecorationLine: 'line-through' }}>{inr(p.mrp)}</Text><Text v="caption" color={colors.success}>{off}% off</Text></> : null}
              {p.ratingCount ? <Text v="caption" color={colors.muted}>★ {p.rating.toFixed(1)} ({p.ratingCount})</Text> : null}
            </View>
            <Text color={colors.muted}>{titleCase(p.shape)} · {titleCase(p.material)}{p.isSunglasses ? ' · Sunglasses' : ''} · {p.lensWidthMm}-{p.bridgeMm}-{p.templeMm} mm{p.frameWidthMm ? ` · ${p.frameWidthMm} mm wide` : ''}</Text>
            {colours.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
                {colours.map((c) => (
                  <View key={c.colorHex} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1) }}>
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.colorHex, borderWidth: 1, borderColor: colors.line }} />
                    <Text v="caption">{c.colorName}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            <Text v="caption" color={inStock ? colors.success : colors.danger}>{inStock ? `In stock${sizes.length ? ` · ${sizes.map(titleCase).join(', ')}` : ''}` : 'Out of stock'}</Text>
            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <Pressable onPress={() => toggleLike(p)} accessibilityRole="button" accessibilityLabel={liked ? 'Remove from wishlist' : 'Save to wishlist'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name={liked ? 'heart' : 'heart-outline'} size={22} color={liked ? '#e11d48' : colors.text} /><Text v="caption">{liked ? 'Saved' : 'Save'}</Text>
              </Pressable>
              <Pressable onPress={() => toggleCompare(p)} accessibilityRole="button" accessibilityLabel={comparing ? 'Remove from compare' : 'Add to compare'} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Ionicons name="git-compare-outline" size={22} color={comparing ? colors.violet : colors.text} /><Text v="caption">{comparing ? 'Comparing' : 'Compare'}</Text>
              </Pressable>
            </View>
            <Button title={t('viewDetails')} onPress={() => go(() => router.push(`/product/${p.slug}`))} />
            <Button kind="secondary" title="👓 Try on" onPress={() => go(() => router.push({ pathname: '/tryon', params: { frame: p.slug } }))} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
