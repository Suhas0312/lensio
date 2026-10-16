import { useEffect, useMemo, useState } from 'react';
import { Image, ScrollView, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams, Stack } from 'expo-router';
import { useLayout } from '@/lib/layout';
import { useFeatures } from '@/lib/features';
import { api, cachedApi } from '@/api/client';
import { useCompare, useWishlist } from '@/store/shopping';
import { useRecent } from '@/lib/recent';
import { SimilarFrames } from '@/components/SimilarFrames';
import { RecentlyViewed } from '@/components/HomeSections';
import { FrameSize, Product } from '@/api/types';
import { useLensFlow } from '@/store/lensFlow';
import { useAuth } from '@/store/auth';
import { Button, Card, Chip, Loading, Row, Screen, Text } from '@/components/UI';
import { ProductReviews } from '@/components/Reviews';
import { Linking } from 'react-native';
import { colors, radius, space } from '@/theme';
import { inr, titleCase } from '@/lib/format';

const SIZE_HINT: Record<FrameSize, string> = {
  SMALL: 'Narrow faces and teens. Frame width under 132 mm.',
  MEDIUM: 'Most adult faces. Frame width 132–140 mm.',
  WIDE: 'Broader faces. Frame width over 140 mm.',
};

export default function ProductScreen() {
  const { readW: W } = useLayout();
  const { slug, size: wantSize } = useLocalSearchParams<{ slug: string; size?: string }>();
  const [p, setP] = useState<Product | null>(null);
  const [color, setColor] = useState<string>();
  const [size, setSize] = useState<FrameSize>();
  const start = useLensFlow((s) => s.start);
  const user = useAuth((s) => s.user);
  const features = useFeatures();
  const liked = useWishlist((s) => (p ? s.ids.has(p.id) : false)), toggleLike = useWishlist((s) => s.toggle);
  const comparing = useCompare((s) => (p ? s.items.some((x) => x.id === p.id) : false)), toggleCompare = useCompare((s) => s.toggle);

  useEffect(() => {
    const apply = (r: Product) => {
      setP(r);
      useRecent.getState().add({ id: r.id, slug: r.slug, name: r.name, image: r.images?.[0]?.url ?? null, price: r.basePrice });
      // Size measured in the try-on (or chosen there) is preselected when that size is in stock.
      const first = r.variants.find((v) => v.size === wantSize && v.stock > 0) ?? r.variants.find((v) => v.stock > 0) ?? r.variants[0];
      setColor(first?.colorHex); setSize(first?.size);
    };
    cachedApi<Product>(`/catalog/products/${slug}`, apply).then(apply).catch(() => {});
  }, [slug]);

  const colorsList = useMemo(() => p ? [...new Map(p.variants.map((v) => [v.colorHex, v])).values()] : [], [p]);
  const sizes = useMemo(() => p ? p.variants.filter((v) => v.colorHex === color) : [], [p, color]);
  const variant = p?.variants.find((v) => v.colorHex === color && v.size === size);

  if (!p) return <Loading />;
  const price = p.basePrice + (variant?.priceDelta ?? 0);
  /** Opens the try-on with this frame and the colour the customer picked. */
  const tryOn = () => router.push({ pathname: '/tryon', params: { frame: p.slug, ...(color ? { color: color.replace('#', '') } : {}) } });

  const buy = (withLens: boolean) => {
    if (!variant) return;
    if (!user) return router.push('/(auth)/login');
    start({ variantId: variant.id, productName: p.name, framePrice: price, isSunglasses: p.isSunglasses });
    if (withLens) router.push(`/lens/${variant.id}`);
    else api('/cart/items', { body: { variantId: variant.id } }).then(() => router.push('/cart'));
  };

  return (
    <Screen footer={
      <Row>
        <Button kind="secondary" title="Frame only" onPress={() => buy(false)} disabled={!variant || variant.stock === 0} style={{ flex: 1 }} />
        <Button title={p.isSunglasses ? 'Add lenses' : 'Select lenses'} onPress={() => buy(true)} disabled={!variant || variant.stock === 0} style={{ flex: 1.4 }} />
      </Row>
    }>
      <Stack.Screen options={{ title: p.brand }} />
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space(5) }}>
        {p.images.map((img) => (
          <View key={img.url} style={{ width: W, aspectRatio: 1.35, backgroundColor: '#F4F5FB' }}>
            <Image source={{ uri: img.url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          </View>
        ))}
      </ScrollView>

      <View style={{ gap: space(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Text v="heading" style={{ flex: 1 }}>{p.name}</Text>
          <Pressable onPress={() => toggleLike(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={liked ? 'Remove from wishlist' : 'Save to wishlist'} style={{ padding: 6 }}>
            <Ionicons name={liked ? 'heart' : 'heart-outline'} size={26} color={liked ? '#e11d48' : colors.text} />
          </Pressable>
          <Pressable onPress={() => toggleCompare(p)} hitSlop={8} accessibilityRole="button" accessibilityLabel={comparing ? 'Remove from compare' : 'Add to compare'} style={{ padding: 6 }}>
            <Ionicons name="git-compare-outline" size={24} color={comparing ? colors.violet : colors.text} />
          </Pressable>
        </View>
        {comparing ? <Pressable onPress={() => router.push('/compare')}><Text v="caption" color={colors.cyan}>In your compare list · Compare now →</Text></Pressable> : null}
        <Row style={{ gap: space(2) }}>
          <Text v="title">{inr(price)}</Text>
          {p.mrp > price ? <Text color={colors.faint} style={{ textDecorationLine: 'line-through' }}>{inr(p.mrp)}</Text> : null}
          <Text v="caption" color={colors.muted}>frame price, lenses from ₹0</Text>
        </Row>
        {p.ratingCount ? <Text v="caption" color={colors.muted}>{p.rating.toFixed(1)} ★ from {p.ratingCount} reviews</Text> : null}
        <Pressable onPress={tryOn} accessibilityRole="button" accessibilityLabel={`Try on ${p.name}`}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), marginTop: space(2), padding: space(3), borderRadius: radius.md, borderWidth: 1, borderColor: colors.cyan, backgroundColor: 'rgba(34,211,238,0.08)', transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <Ionicons name="scan-outline" size={26} color={colors.cyan} />
          <View style={{ flex: 1 }}>
            <Text v="bodyStrong">👓 Try it on your face</Text>
            <Text v="caption" color={colors.muted}>See this frame{colorsList.find((c) => c.colorHex === color)?.colorName ? ` in ${colorsList.find((c) => c.colorHex === color)?.colorName}` : ''} live with your camera, and check your size</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.cyan} />
        </Pressable>
      </View>

      <View style={{ gap: space(2) }}>
        <Text v="bodyStrong">Colour: {colorsList.find((c) => c.colorHex === color)?.colorName}</Text>
        <Row style={{ gap: space(3) }}>
          {colorsList.map((c) => (
            <View key={c.colorHex} style={{ padding: 3, borderRadius: 20, borderWidth: 2, borderColor: color === c.colorHex ? colors.violet : 'transparent' }}>
              <View onTouchEnd={() => { setColor(c.colorHex); setSize(p.variants.find((v) => v.colorHex === c.colorHex && v.stock > 0)?.size ?? c.size); }}
                accessibilityLabel={c.colorName} accessibilityRole="button"
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c.colorHex, borderWidth: 1, borderColor: colors.line }} />
            </View>
          ))}
        </Row>
      </View>

      <View style={{ gap: space(2) }}>
        <Text v="bodyStrong">Size</Text>
        <Row style={{ gap: space(2) }}>
          {sizes.map((v) => <Chip key={v.id} label={`${titleCase(v.size)}${v.stock === 0 ? ' · sold out' : ''}`} selected={size === v.size} onPress={() => setSize(v.size)} />)}
        </Row>
        {size ? <Text v="caption" color={colors.muted}>{SIZE_HINT[size]}</Text> : null}
        {variant && variant.stock > 0 && variant.stock <= 3 ? <Text v="caption" color={colors.warning}>Only {variant.stock} left</Text> : null}
      </View>

      <Card>
        <Text v="title">Frame measurements</Text>
        <Row style={{ justifyContent: 'space-between' }}>
          {[['Lens width', p.lensWidthMm], ['Bridge', p.bridgeMm], ['Temple', p.templeMm], ['Frame width', p.frameWidthMm]].map(([l, v]) => (
            <View key={l as string} style={{ alignItems: 'center', gap: 2 }}>
              <Text v="title">{v}</Text><Text v="caption" color={colors.muted}>{l} mm</Text>
            </View>
          ))}
        </Row>
        <Text v="caption" color={colors.faint}>Compare with your current glasses: the numbers on the inside of the arm read lens–bridge–temple, like {p.lensWidthMm}-{p.bridgeMm}-{p.templeMm}.</Text>
      </Card>

      <Button kind="secondary" title="👓 Try this frame on" onPress={tryOn} />
      {features.assistant ? <Button kind="ghost" title="💬 Ask about this frame" onPress={() => router.push({ pathname: '/assistant', params: { ask: `Tell me about the ${p.name}: who it suits, and which lenses you'd pair with it.` } })} /> : null}

      <View style={{ gap: space(2) }}>
        <Text v="title">Details</Text>
        <Text color={colors.muted}>{p.description}</Text>
        <Text v="caption" color={colors.muted}>{titleCase(p.shape)} · {titleCase(p.material)}{p.weightGrams ? ` · ${p.weightGrams} g` : ''}</Text>
      </View>

      {(p as any).instagramPostUrl ? <Button kind="secondary" title="📸 View on Instagram" onPress={() => Linking.openURL((p as any).instagramPostUrl)} /> : null}

      <ProductReviews slug={p.slug} />
      <SimilarFrames p={p} />
      <RecentlyViewed excludeId={p.id} />
      <View style={{ height: space(2), borderRadius: radius.sm }} />
    </Screen>
  );
}
