import { useEffect } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Product } from '@/api/types';
import { useCompare } from '@/store/shopping';
import { Button, Empty, Screen, Text } from '@/components/UI';
import { inr, titleCase } from '@/lib/format';
import { tr } from '@/i18n';
import { colors, radius, space } from '@/theme';

type RowDef = { label: string; get: (p: Product) => string; best?: 'low' | 'high'; num?: (p: Product) => number | null };
const ROWS: RowDef[] = [
  { label: 'Price', get: (p) => inr(p.basePrice), best: 'low', num: (p) => p.basePrice },
  { label: 'You save', get: (p) => (p.mrp > p.basePrice ? `${inr(p.mrp - p.basePrice)} (${Math.round((1 - p.basePrice / p.mrp) * 100)}%)` : '—') },
  { label: 'Rating', get: (p) => (p.ratingCount ? `★ ${p.rating.toFixed(1)} (${p.ratingCount})` : 'New'), best: 'high', num: (p) => (p.ratingCount ? p.rating : null) },
  { label: 'Size', get: (p) => (p.sizeBand ? titleCase(p.sizeBand) : '—') },
  { label: 'Frame width', get: (p) => (p.frameWidthMm ? `${p.frameWidthMm} mm` : '—') },
  { label: 'Lens · bridge · arm', get: (p) => `${p.lensWidthMm}-${p.bridgeMm}-${p.templeMm} mm` },
  { label: 'Shape', get: (p) => titleCase(p.shape) },
  { label: 'Material', get: (p) => titleCase(p.material) },
  { label: 'Weight', get: (p) => (p.weightGrams ? `${p.weightGrams} g` : '—'), best: 'low', num: (p) => p.weightGrams ?? null },
  { label: 'Type', get: (p) => (p.isSunglasses ? 'Sunglasses' : 'Eyeglasses') },
  { label: 'For', get: (p) => titleCase(p.gender) },
  { label: 'Colours', get: (p) => String(new Set((p.variants ?? []).map((v) => v.colorHex)).size || '—') },
];

/** Side-by-side comparison of up to 3 frames; differences are highlighted. */
export default function Compare() {
  const { items, init, toggle } = useCompare();
  useEffect(() => { init(); }, [init]);
  if (!items.length) {
    return <Screen><Stack.Screen options={{ title: 'Compare frames' }} />
      <Empty title="Nothing to compare yet" body="Tap ⇄ on up to 3 frames in the shop to compare them here." action={<Button title="Browse frames" onPress={() => router.replace('/(tabs)/shop')} />} /></Screen>;
  }
  const colW = 150, labelW = 112;
  return (
    <Screen padded={false}>
      <Stack.Screen options={{ title: tr(`Compare ${items.length} frames`) }} />
      <ScrollView horizontal contentContainerStyle={{ padding: space(4) }}>
        <View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ width: labelW }} />
            {items.map((p) => (
              <View key={p.id} style={{ width: colW, paddingHorizontal: 6, gap: 6 }}>
                <View style={{ backgroundColor: '#F4F5FB', borderRadius: radius.md, aspectRatio: 1.25, overflow: 'hidden' }}>
                  {p.images?.[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
                  <Pressable onPress={() => toggle(p)} hitSlop={8} accessibilityLabel={`Remove ${p.name}`} style={{ position: 'absolute', right: 4, top: 4, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 12 }}>
                    <Ionicons name="close" size={20} color="#1B1F3B" />
                  </Pressable>
                </View>
                <Text v="bodyStrong" numberOfLines={2}>{p.name}</Text>
              </View>
            ))}
          </View>
          {ROWS.map((r, i) => {
            const vals = items.map(r.get), same = vals.every((v) => v === vals[0]);
            const nums = r.num ? items.map(r.num) : [], valid = nums.filter((n): n is number => n != null);
            const bestVal = r.best && valid.length > 1 ? (r.best === 'low' ? Math.min(...valid) : Math.max(...valid)) : null;
            return (
              <View key={r.label} style={{ flexDirection: 'row', backgroundColor: i % 2 ? 'transparent' : colors.surface, borderRadius: 8 }}>
                <Text v="caption" color={colors.muted} style={{ width: labelW, paddingVertical: space(3), paddingLeft: space(2) }}>{r.label}</Text>
                {items.map((p, k) => {
                  const isBest = bestVal != null && nums[k] === bestVal && !same;
                  return <Text key={p.id} style={{ width: colW, paddingVertical: space(3), paddingHorizontal: 6, fontWeight: !same ? '700' : '400' }} color={isBest ? colors.success : colors.text}>{vals[k]}{isBest ? ' ✓' : ''}</Text>;
                })}
              </View>
            );
          })}
          <View style={{ flexDirection: 'row', marginTop: space(3) }}>
            <View style={{ width: labelW }} />
            {items.map((p) => (
              <View key={p.id} style={{ width: colW, paddingHorizontal: 6, gap: 8 }}>
                <Button title="View" onPress={() => router.push(`/product/${p.slug}`)} />
                <Button kind="secondary" title="Try on" onPress={() => router.push({ pathname: '/(tabs)/tryon', params: { frame: p.slug } })} />
              </View>
            ))}
          </View>
          <Text v="caption" color={colors.faint} style={{ marginTop: space(4) }}>Bold rows differ between frames. Green ✓ marks the best value.</Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
