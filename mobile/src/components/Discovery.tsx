import { useState } from 'react';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '@/theme';
import { useFeatures } from '@/lib/features';
import { Text } from './UI';

const glass = { borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', backgroundColor: 'rgba(21,27,77,0.62)' } as const;
type Params = Record<string, string>;

/** Shop by occasion: each tile opens the shop with filters that fit the occasion (based on real frame details). */
const OCCASIONS: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; params: Params }[] = [
  { icon: 'desktop-outline', title: 'Office & screens', sub: 'Clean rectangles', params: { kind: 'eyeglasses', shape: 'RECTANGLE' } },
  { icon: 'car-outline', title: 'Driving', sub: 'Aviator sunglasses', params: { kind: 'sunglasses', shape: 'AVIATOR' } },
  { icon: 'sunny-outline', title: 'Beach & travel', sub: 'Wayfarer shades', params: { kind: 'sunglasses', shape: 'WAYFARER' } },
  { icon: 'sparkles-outline', title: 'Party & statement', sub: 'Cat-eye frames', params: { shape: 'CAT_EYE' } },
  { icon: 'bicycle-outline', title: 'Sports & active', sub: 'Light, bendable TR90', params: { material: 'TR90' } },
  { icon: 'book-outline', title: 'Reading', sub: 'Classic round', params: { kind: 'eyeglasses', shape: 'ROUND' } },
  { icon: 'school-outline', title: 'Kids & school', sub: 'Tough kids frames', params: { gender: 'KIDS' } },
];

export function ShopByOccasion() {
  return (
    <View style={{ gap: space(3) }}>
      <Text v="heading">Shop by occasion</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {OCCASIONS.map((o) => (
          <Pressable key={o.title} onPress={() => router.push({ pathname: '/shop', params: o.params })} accessibilityRole="button" accessibilityLabel={`${o.title}: ${o.sub}`}
            style={({ pressed }) => [glass, { width: 150, padding: space(3), gap: space(1), transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <Ionicons name={o.icon} size={24} color={colors.cyan} />
            <Text v="bodyStrong">{o.title}</Text>
            <Text v="caption" color={colors.muted}>{o.sub}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Category bar for computers and tablets (wide screens): main collections, a shapes menu and quick links. */
const LINKS: [string, Params][] = [['Eyeglasses', { kind: 'eyeglasses' }], ['Sunglasses', { kind: 'sunglasses' }], ['Men', { gender: 'MEN' }], ['Women', { gender: 'WOMEN' }], ['Kids', { gender: 'KIDS' }], ['New arrivals', { sort: 'new' }]];
const SHAPES: [string, string][] = [['RECTANGLE', 'Rectangle'], ['ROUND', 'Round'], ['CAT_EYE', 'Cat-eye'], ['AVIATOR', 'Aviator'], ['WAYFARER', 'Wayfarer'], ['SQUARE', 'Square'], ['OVAL', 'Oval'], ['GEOMETRIC', 'Geometric']];

export function DesktopNav() {
  const { width } = useWindowDimensions();
  const [shapesOpen, setShapesOpen] = useState(false);
  const { stores } = useFeatures();
  if (width < 900) return null;
  const shop = (params: Params) => { setShapesOpen(false); router.push({ pathname: '/shop', params }); };
  const link = (label: string, onPress: () => void, icon?: keyof typeof Ionicons.glyphMap) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="link" style={(st) => ({ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.pill, backgroundColor: (st as { hovered?: boolean }).hovered || st.pressed ? 'rgba(123,97,255,0.18)' : 'transparent' })}>
      {icon ? <Ionicons name={icon} size={16} color={colors.cyan} /> : null}
      <Text v="bodyStrong">{label}</Text>
    </Pressable>
  );
  return (
    <View style={[glass, { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space(1), paddingHorizontal: space(2), paddingVertical: space(1), zIndex: 20, ...(Platform.OS === 'web' ? ({ position: 'sticky', top: 0 } as object) : {}) }]} accessibilityRole="menubar">
      {LINKS.map(([l, p]) => link(l, () => shop(p)))}
      <View style={{ position: 'relative', zIndex: 30 }}>
        {link(`Shapes ${shapesOpen ? '▴' : '▾'}`, () => setShapesOpen((o) => !o))}
        {shapesOpen ? (
          <View style={[glass, { position: 'absolute', top: 44, left: 0, width: 200, padding: space(2), backgroundColor: colors.surface, gap: 2 }]} accessibilityRole="menu">
            {SHAPES.map(([k, l]) => (
              <Pressable key={k} onPress={() => shop({ shape: k })} accessibilityRole="menuitem" style={(st) => ({ padding: space(2), borderRadius: radius.sm, backgroundColor: (st as { hovered?: boolean }).hovered || st.pressed ? 'rgba(123,97,255,0.18)' : 'transparent' })}>
                <Text>{l}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      {link('Try on', () => router.push('/tryon'), 'scan-outline')}
      {link('Compare', () => router.push('/compare'), 'git-compare-outline')}
      {link('Wishlist', () => router.push('/wishlist'), 'heart-outline')}
      {stores ? link('Stores', () => router.push('/stores'), 'location-outline') : null}
    </View>
  );
}
