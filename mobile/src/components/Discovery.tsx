import { useState } from 'react';
import { Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, space } from '@/theme';
import { useFeatures } from '@/lib/features';
import { Text } from './UI';
import { Key, useT } from '@/i18n';

const glass = { borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', backgroundColor: 'rgba(21,27,77,0.62)' } as const;
type Params = Record<string, string>;

/** Shop by occasion: each tile opens the shop with filters that fit the occasion (based on real frame details). */
const OCCASIONS: { icon: keyof typeof Ionicons.glyphMap; title: Key; sub: Key; params: Params }[] = [
  { icon: 'desktop-outline', title: 'occOffice', sub: 'occOfficeSub', params: { kind: 'eyeglasses', shape: 'RECTANGLE' } },
  { icon: 'car-outline', title: 'occDriving', sub: 'occDrivingSub', params: { kind: 'sunglasses', shape: 'AVIATOR' } },
  { icon: 'sunny-outline', title: 'occBeach', sub: 'occBeachSub', params: { kind: 'sunglasses', shape: 'WAYFARER' } },
  { icon: 'sparkles-outline', title: 'occParty', sub: 'occPartySub', params: { shape: 'CAT_EYE' } },
  { icon: 'bicycle-outline', title: 'occSports', sub: 'occSportsSub', params: { material: 'TR90' } },
  { icon: 'book-outline', title: 'occReading', sub: 'occReadingSub', params: { kind: 'eyeglasses', shape: 'ROUND' } },
  { icon: 'school-outline', title: 'occKids', sub: 'occKidsSub', params: { gender: 'KIDS' } },
];

export function ShopByOccasion() {
  const t = useT();
  return (
    <View style={{ gap: space(3) }}>
      <Text v="heading">{t('shopByOccasion')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {OCCASIONS.map((o) => (
          <Pressable key={o.title} onPress={() => router.push({ pathname: '/shop', params: o.params })} accessibilityRole="button" accessibilityLabel={`${t(o.title)}: ${t(o.sub)}`}
            style={({ pressed }) => [glass, { width: 150, padding: space(3), gap: space(1), transform: [{ scale: pressed ? 0.96 : 1 }] }]}>
            <Ionicons name={o.icon} size={24} color={colors.cyan} />
            <Text v="bodyStrong">{t(o.title)}</Text>
            <Text v="caption" color={colors.muted}>{t(o.sub)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Category bar for computers and tablets (wide screens): main collections, a shapes menu and quick links. */
const LINKS: [Key, Params][] = [['eyeglasses', { kind: 'eyeglasses' }], ['sunglasses', { kind: 'sunglasses' }], ['men', { gender: 'MEN' }], ['women', { gender: 'WOMEN' }], ['kids', { gender: 'KIDS' }], ['newArrivals', { sort: 'new' }]];
const SHAPES: [string, Key][] = [['RECTANGLE', 'shapeRectangle'], ['ROUND', 'shapeRound'], ['CAT_EYE', 'shapeCatEye'], ['AVIATOR', 'shapeAviator'], ['WAYFARER', 'shapeWayfarer'], ['SQUARE', 'shapeSquare'], ['OVAL', 'shapeOval'], ['GEOMETRIC', 'shapeGeometric']];

export function DesktopNav() {
  const t = useT();
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
      {LINKS.map(([l, p]) => link(t(l), () => shop(p)))}
      <View style={{ position: 'relative', zIndex: 30 }}>
        {link(`${t('shapes')} ${shapesOpen ? '▴' : '▾'}`, () => setShapesOpen((o) => !o))}
        {shapesOpen ? (
          <View style={[glass, { position: 'absolute', top: 44, left: 0, width: 200, padding: space(2), backgroundColor: colors.surface, gap: 2 }]} accessibilityRole="menu">
            {SHAPES.map(([k, l]) => (
              <Pressable key={k} onPress={() => shop({ shape: k })} accessibilityRole="menuitem" style={(st) => ({ padding: space(2), borderRadius: radius.sm, backgroundColor: (st as { hovered?: boolean }).hovered || st.pressed ? 'rgba(123,97,255,0.18)' : 'transparent' })}>
                <Text>{t(l)}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1 }} />
      {link(t('tryon'), () => router.push('/tryon'), 'scan-outline')}
      {link(t('compare'), () => router.push('/compare'), 'git-compare-outline')}
      {link(t('wishlist'), () => router.push('/wishlist'), 'heart-outline')}
      {stores ? link(t('stores'), () => router.push('/stores'), 'location-outline') : null}
    </View>
  );
}
