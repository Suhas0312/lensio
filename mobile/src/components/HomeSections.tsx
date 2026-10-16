import { createElement, useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { Image, Linking, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { API_URL, cachedApi } from '@/api/client';
import { Row, Text } from '@/components/UI';
import { inr } from '@/lib/format';
import { useRecent } from '@/lib/recent';
import { colors, gradient, radius, space } from '@/theme';

const open = (link: string) => { if (!link) return; if (link.startsWith('/')) router.push(link as never); else Linking.openURL(link); };
const glass = { backgroundColor: 'rgba(21,27,77,0.62)', borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', borderRadius: radius.md } as const;

interface Banner { id: string; title: string; text: string; cta: string; link: string; imageDesktop: string | null; imageMobile: string | null; alt: string; videoDesktop?: string | null; videoMobile?: string | null }

/** Silent looping banner video: the browser's <video> on the website, a WebView in the app (no extra native module). */
function BannerVideo({ src, poster }: { src: string; poster?: string | null }) {
  const fill = { position: 'absolute' as const, width: '100%' as const, height: '100%' as const };
  if (Platform.OS === 'web') {
    return createElement('video', { src, poster: poster ?? undefined, autoPlay: true, muted: true, loop: true, playsInline: true, preload: 'auto',
      'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' } });
  }
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#040722;overflow:hidden}video{width:100%;height:100%;object-fit:cover}</style></head>
    <body><video src="${src.replace(/"/g, '')}" ${poster ? `poster="${poster.replace(/"/g, '')}"` : ''} autoplay muted loop playsinline></video></body></html>`;
  return (
    <View pointerEvents="none" style={fill}>
      <WebView source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} originWhitelist={['*']} scrollEnabled={false}
        mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback javaScriptEnabled={false} />
    </View>
  );
}

/** Rotating home banners from admin → Banners (desktop / mobile images, text, button). Hidden when there are none. */
export function HomeBanners({ width }: { width: number }) {
  const [list, setList] = useState<Banner[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<ScrollView>(null);
  const { width: screen } = useWindowDimensions();
  const wide = screen >= 700;
  useEffect(() => { cachedApi<Banner[]>('/catalog/banners', setList).then(setList).catch(() => {}); }, []);
  const goTo = (n: number) => { const k = (n + list.length) % list.length; setI(k); ref.current?.scrollTo({ x: k * width, animated: true }); };
  const [pausedAt, setPausedAt] = useState(0);   // a swipe or arrow tap pauses the automatic change for a while
  // Auto-advance one by one: images every 5.5 s, video banners stay 9 s so the clip can play.
  useEffect(() => {
    if (list.length < 2) return;
    const b = list[i];
    const hasVideo = !!(b && (b.videoDesktop || b.videoMobile));
    const wait = Math.max(hasVideo ? 9000 : 5500, pausedAt + 12000 - Date.now());
    const t = setTimeout(() => goTo(i + 1), wait);
    return () => clearTimeout(t);
  }, [list, i, width, pausedAt]);
  if (!list.length || width <= 0) return null;
  const h = wide ? Math.round(width / 2.67) : Math.round(width * 0.62);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => { const k = Math.round(e.nativeEvent.contentOffset.x / width); if (k !== i) { setI(k); setPausedAt(Date.now()); } };
  return (
    <View style={{ gap: space(2), position: 'relative' }}>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={Platform.OS === 'web' ? onScroll : undefined} scrollEventThrottle={64}
        style={{ width, borderRadius: radius.lg }} accessibilityLabel="Offers and collections">
        {list.map((b, k) => {
          const img = (wide ? b.imageDesktop : b.imageMobile) || b.imageDesktop || b.imageMobile;
          const vid = (wide ? b.videoDesktop : b.videoMobile) || b.videoDesktop || b.videoMobile;
          return (
            <Pressable key={b.id} onPress={() => open(b.link)} accessibilityRole={b.link ? 'link' : undefined} accessibilityLabel={b.alt || b.title}
              style={{ width, height: h, borderRadius: radius.lg, overflow: 'hidden' }}>
              {img ? <Image source={{ uri: img }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" accessibilityIgnoresInvertColors />
                : <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', width: '100%', height: '100%' }} />}
              {vid && k === i ? <BannerVideo src={vid} poster={img} /> : null}
              <LinearGradient colors={['transparent', 'rgba(4,7,34,0.78)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' }} />
              <View style={{ position: 'absolute', left: space(5), right: space(5), bottom: space(5), gap: space(1) }}>
                <Text v="title" color="#fff">{b.title}</Text>
                {b.text ? <Text color="#E5E7FF">{b.text}</Text> : null}
                {b.cta && b.link ? <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), marginTop: space(2) }}><Text v="bodyStrong" color={colors.violet}>{b.cta} →</Text></View> : null}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      {list.length > 1 && wide ? (['‹', '›'] as const).map((a, d) => (
        <Pressable key={a} onPress={() => { setPausedAt(Date.now()); goTo(i + (d ? 1 : -1)); }} accessibilityRole="button" accessibilityLabel={d ? 'Next banner' : 'Previous banner'}
          style={{ position: 'absolute', top: h / 2 - 22, [d ? 'right' : 'left']: space(3), width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(4,7,34,0.55)', alignItems: 'center', justifyContent: 'center' }}>
          <Text v="title" color="#fff">{a}</Text>
        </Pressable>
      )) : null}
      {list.length > 1 ? <Row style={{ justifyContent: 'center', gap: 6 }}>{list.map((b, k) => (
        <Pressable key={b.id} onPress={() => { setPausedAt(Date.now()); goTo(k); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Banner ${k + 1} of ${list.length}`}>
          <View style={{ width: k === i ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: k === i ? colors.cyan : colors.line }} />
        </Pressable>
      ))}</Row> : null}
    </View>
  );
}

function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ justifyContent: 'space-between' }}>
      <Text v="title">{title}</Text>
      {action ? <Pressable onPress={onAction} accessibilityRole="link"><Text v="caption" color={colors.cyan}>{action}</Text></Pressable> : null}
    </Row>
  );
}

const SHAPES: [string, string][] = [['RECTANGLE', 'Rectangle'], ['ROUND', 'Round'], ['CAT_EYE', 'Cat-eye'], ['AVIATOR', 'Aviator'], ['WAYFARER', 'Wayfarer'], ['SQUARE', 'Square'], ['OVAL', 'Oval'], ['GEOMETRIC', 'Geometric']];
/** Shop by frame shape: drawn frame tiles → Shop filtered by that shape. */
export function ShopByShape() {
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title="Shop by frame shape" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {SHAPES.map(([k, l]) => (
          <Pressable key={k} onPress={() => router.push({ pathname: '/shop', params: { shape: k } })} accessibilityRole="button" accessibilityLabel={`${l} frames`}
            style={({ pressed }) => [{ width: 118, overflow: 'hidden', transform: [{ scale: pressed ? 0.96 : 1 }] }, glass]}>
            <View style={{ backgroundColor: '#F4F5FB', height: 72, justifyContent: 'center' }}>
              <Image source={{ uri: `${API_URL}/catalog/shape-art/${k}.png` }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
            </View>
            <Text v="bodyStrong" style={{ padding: space(2.5), textAlign: 'center' }}>{l}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const FACES: { face: string; best: string; label: string; tip: string }[] = [
  { face: 'Round', best: 'RECTANGLE', label: 'Rectangle & square', tip: 'Angles add definition' },
  { face: 'Square', best: 'ROUND', label: 'Round & oval', tip: 'Curves soften a strong jaw' },
  { face: 'Oval', best: 'WAYFARER', label: 'Almost any shape', tip: 'Balanced proportions' },
  { face: 'Heart', best: 'AVIATOR', label: 'Aviator & round', tip: 'Balance a wider forehead' },
  { face: 'Long', best: 'SQUARE', label: 'Deep, bold frames', tip: 'Shorten a longer face' },
];
/** Shop by face shape, with a shortcut to the AI face scan for customers who don't know theirs. */
export function ShopByFace() {
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title="Shop by face shape" action="Not sure? Scan my face →" onAction={() => router.push('/tryon')} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {FACES.map((f) => (
          <Pressable key={f.face} onPress={() => router.push({ pathname: '/shop', params: { shape: f.best } })} accessibilityRole="button" accessibilityLabel={`Frames for a ${f.face.toLowerCase()} face`}
            style={({ pressed }) => [{ width: 150, padding: space(3), gap: space(1), transform: [{ scale: pressed ? 0.96 : 1 }] }, glass]}>
            <Ionicons name="happy-outline" size={24} color={colors.magenta} />
            <Text v="bodyStrong">{f.face} face</Text>
            <Text v="caption" color={colors.cyan}>{f.label}</Text>
            <Text v="caption" color={colors.muted}>{f.tip}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const COLLECTIONS: { t: string; icon: keyof typeof Ionicons.glyphMap; params: Record<string, string> }[] = [
  { t: 'Men', icon: 'man-outline', params: { gender: 'MEN' } }, { t: 'Women', icon: 'woman-outline', params: { gender: 'WOMEN' } },
  { t: 'Kids', icon: 'happy-outline', params: { gender: 'KIDS' } }, { t: 'Eyeglasses', icon: 'glasses-outline', params: { kind: 'eyeglasses' } },
  { t: 'Sunglasses', icon: 'sunny-outline', params: { kind: 'sunglasses' } }, { t: 'Titanium', icon: 'diamond-outline', params: { material: 'TITANIUM' } },
];
/** Collections: who it's for, type and material. */
export function Collections() {
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title="Collections" action="All frames" onAction={() => router.push('/shop')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
        {COLLECTIONS.map((c) => (
          <Pressable key={c.t} onPress={() => router.push({ pathname: '/shop', params: c.params })} accessibilityRole="button"
            style={({ pressed }) => [{ flexBasis: '30%', flexGrow: 1, minWidth: 100, padding: space(3), flexDirection: 'row', alignItems: 'center', gap: space(2), transform: [{ scale: pressed ? 0.97 : 1 }] }, glass]}>
            <Ionicons name={c.icon} size={22} color={colors.cyan} />
            <Text v="bodyStrong">{c.t}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/** Recently viewed frames (this device). */
export function RecentlyViewed({ excludeId, title = 'Recently viewed' }: { excludeId?: string; title?: string }) {
  const { items, init } = useRecent();
  useEffect(() => { init(); }, [init]);
  const list = items.filter((x) => x.id !== excludeId);
  if (!list.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={title} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
        {list.map((p) => (
          <Pressable key={p.id} onPress={() => router.push(`/product/${p.slug}`)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.price)}`}
            style={({ pressed }) => [{ width: 140, overflow: 'hidden', transform: [{ scale: pressed ? 0.96 : 1 }] }, glass]}>
            <View style={{ backgroundColor: '#F4F5FB', height: 90 }}>{p.image ? <Image source={{ uri: p.image }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}</View>
            <View style={{ padding: space(2.5) }}>
              <Text v="caption" numberOfLines={1}>{p.name}</Text>
              <Text v="bodyStrong">{inr(p.price)}</Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
