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
import { useT } from '@/i18n';

const open = (link: string) => { if (!link) return; if (link.startsWith('/')) router.push(link as never); else Linking.openURL(link); };
const glass = { backgroundColor: 'rgba(21,27,77,0.62)', borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', borderRadius: radius.md } as const;

interface Banner { id: string; title: string; text: string; cta: string; link: string; imageDesktop: string | null; imageMobile: string | null; alt: string; videoDesktop?: string | null; videoMobile?: string | null; textInImage?: boolean; sound?: boolean; audio?: string | null; fit?: 'fill' | 'whole'; focus?: 'center' | 'top' | 'bottom' }
type Fit = { fit?: 'fill' | 'whole'; focus?: 'center' | 'top' | 'bottom' };
const objPos = (focus?: string) => (focus === 'top' ? 'center top' : focus === 'bottom' ? 'center bottom' : 'center');

/**
 * A picture of any size fitted into the banner: 'fill' covers it (keeping the middle/top/bottom), 'whole' shows all
 * of it with a soft blurred copy behind, so one upload works for phones and computers.
 */
function BannerImage({ src, fit, focus }: { src: string } & Fit) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => { if (Platform.OS !== 'web') Image.getSize(src, (w, h) => setSize({ w, h }), () => {}); }, [src]);
  const fill = { position: 'absolute' as const, width: '100%' as const, height: '100%' as const };
  if (Platform.OS === 'web') {
    const img = (f: string, extra: object) => createElement('img', { src, alt: '', 'aria-hidden': true, draggable: false,
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: f, objectPosition: objPos(focus), pointerEvents: 'none', ...extra } });
    return fit === 'whole'
      ? <>{img('cover', { filter: 'blur(18px) brightness(.7)', transform: 'scale(1.15)' })}{img('contain', {})}</>
      : img('cover', {});
  }
  if (fit === 'whole') {
    return <>
      <Image source={{ uri: src }} style={fill} resizeMode="cover" blurRadius={18} />
      <View style={[fill, { backgroundColor: 'rgba(4,7,34,0.3)' }]} />
      <Image source={{ uri: src }} style={fill} resizeMode="contain" accessibilityIgnoresInvertColors />
    </>;
  }
  // 'fill' with top/bottom: size the picture ourselves (React Native's "cover" always keeps the middle)
  if (focus && focus !== 'center' && size && box) {
    const scale = Math.max(box.w / size.w, box.h / size.h), w = size.w * scale, h = size.h * scale;
    return <View style={fill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <Image source={{ uri: src }} style={{ position: 'absolute', width: w, height: h, left: (box.w - w) / 2, top: focus === 'top' ? 0 : box.h - h }} accessibilityIgnoresInvertColors />
    </View>;
  }
  return <View style={fill} onLayout={(e) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
    <Image source={{ uri: src }} style={fill} resizeMode="cover" accessibilityIgnoresInvertColors />
  </View>;
}

/** Banner music / voice-over: plays only after the customer taps 🔊 (website: <audio>; app: hidden WebView). */
function BannerAudio({ src, playing }: { src: string; playing: boolean }) {
  const webRef = useRef<HTMLAudioElement | null>(null);
  const nativeRef = useRef<WebView>(null);
  useEffect(() => {
    if (Platform.OS === 'web') { const a = webRef.current; if (a) { if (playing) a.play().catch(() => {}); else a.pause(); } }
    else nativeRef.current?.injectJavaScript(`(function(){var a=document.querySelector('audio');if(a){${playing ? 'a.play();' : 'a.pause();'}}})();true;`);
  }, [playing]);
  useEffect(() => () => { webRef.current?.pause(); }, []);
  if (Platform.OS === 'web') return createElement('audio', { ref: webRef, src, loop: true, preload: 'none' });
  return (
    <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
      <WebView ref={nativeRef} source={{ html: `<audio src="${src.replace(/"/g, '')}" loop preload="auto"></audio>` }} originWhitelist={['*']}
        mediaPlaybackRequiresUserAction={false} javaScriptEnabled />
    </View>
  );
}

/** Silent looping banner video: the browser's <video> on the website, a WebView in the app (no extra native module). */
function BannerVideo({ src, poster, muted = true, fit, focus }: { src: string; poster?: string | null; muted?: boolean } & Fit) {
  const fill = { position: 'absolute' as const, width: '100%' as const, height: '100%' as const };
  const webRef = useRef<HTMLVideoElement | null>(null);
  const nativeRef = useRef<WebView>(null);
  // Videos always start muted (browsers block sound until a tap); the 🔊 button switches sound on/off.
  useEffect(() => {
    if (Platform.OS === 'web') { const v = webRef.current; if (v) { v.muted = muted; if (!muted) v.play().catch(() => {}); } }
    else nativeRef.current?.injectJavaScript(`(function(){var v=document.getElementById('main');if(v){v.muted=${muted};v.play();}})();true;`);
  }, [muted]);
  if (Platform.OS === 'web') {
    const main = createElement('video', { ref: webRef, src, poster: poster ?? undefined, autoPlay: true, muted: true, loop: true, playsInline: true, preload: 'auto',
      'aria-hidden': true, style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: fit === 'whole' ? 'contain' : 'cover', objectPosition: objPos(focus), pointerEvents: 'none' } });
    if (fit !== 'whole') return main;
    // whole video + a blurred copy behind it (always silent)
    return <>{createElement('video', { src, autoPlay: true, muted: true, loop: true, playsInline: true, 'aria-hidden': true,
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(18px) brightness(.7)', transform: 'scale(1.15)', pointerEvents: 'none' } })}{main}</>;
  }
  const safe = src.replace(/"/g, ''), pos = objPos(focus);
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#040722;overflow:hidden}
    video{position:absolute;inset:0;width:100%;height:100%;object-fit:${fit === 'whole' ? 'contain' : 'cover'};object-position:${pos}}
    #bg{object-fit:cover;filter:blur(18px) brightness(.7);transform:scale(1.15)}</style></head>
    <body>${fit === 'whole' ? `<video id="bg" src="${safe}" autoplay muted loop playsinline></video>` : ''}<video id="main" src="${safe}" ${poster ? `poster="${poster.replace(/"/g, '')}"` : ''} autoplay muted loop playsinline></video></body></html>`;
  return (
    <View pointerEvents="none" style={fill}>
      <WebView ref={nativeRef} source={{ html }} style={{ flex: 1, backgroundColor: 'transparent' }} originWhitelist={['*']} scrollEnabled={false}
        mediaPlaybackRequiresUserAction={false} allowsInlineMediaPlayback javaScriptEnabled />
    </View>
  );
}

/** Rotating home banners from admin → Banners (desktop / mobile images, text, button). Hidden when there are none. */
/** The app writes headline/text/button on the picture unless the picture already has its own text. */
const showText = (b: Banner) => !b.textInImage && !!(b.title || b.text || (b.cta && b.link));

export function HomeBanners({ width }: { width: number }) {
  const [all, setList] = useState<Banner[]>([]);
  const [i, setI] = useState(0);
  const ref = useRef<ScrollView>(null);
  const { width: screen } = useWindowDimensions();
  const wide = screen >= 700;
  // Each device shows only its own banners (no doubles): phones need a mobile picture/video, computers a desktop one.
  // A banner without any picture (text on the brand colours) shows on both.
  const list = all.filter((b) => {
    const desk = !!(b.imageDesktop || b.videoDesktop), mob = !!(b.imageMobile || b.videoMobile);
    return wide ? desk || (!desk && !mob) : mob || (!desk && !mob);
  });
  useEffect(() => { cachedApi<Banner[]>('/catalog/banners', setList).then(setList).catch(() => {}); }, []);
  useEffect(() => { setI(0); ref.current?.scrollTo({ x: 0, animated: false }); }, [wide]);   // phone ↔ desktop: start again
  const autoUntil = useRef(0);   // our own scrolling, not a customer's swipe
  const goTo = (n: number) => { const k = (n + list.length) % list.length; autoUntil.current = Date.now() + 900; setI(k); ref.current?.scrollTo({ x: k * width, animated: true }); };
  const [pausedAt, setPausedAt] = useState(0);   // a swipe or arrow tap pauses the automatic change for a while
  const [soundOn, setSoundOn] = useState(false);  // customer tapped 🔊 on a video banner
  // Auto-advance one by one: images every 5.5 s, video banners stay 9 s so the clip can play.
  useEffect(() => {
    if (list.length < 2 || soundOn) return;      // listening with sound: stay on this banner
    const b = list[i];
    const hasVideo = !!(b && (b.videoDesktop || b.videoMobile));
    const wait = Math.max(hasVideo ? 9000 : 5500, pausedAt + 12000 - Date.now());
    const t = setTimeout(() => goTo(i + 1), wait);
    return () => clearTimeout(t);
  }, [list, i, width, pausedAt, soundOn]);
  useEffect(() => { setSoundOn(false); }, [i]);   // sound never carries over to the next banner
  if (!list.length || width <= 0) return null;
  const h = wide ? Math.round(width / 2.67) : Math.round(width * 0.62);
  // Only a real swipe pauses the automatic change (the carousel's own movement used to count as a swipe → uneven timing).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (Date.now() < autoUntil.current) return;
    const k = Math.round(e.nativeEvent.contentOffset.x / width);
    if (k !== i && k >= 0 && k < list.length) { setI(k); setPausedAt(Date.now()); }
  };
  return (
    <View style={{ gap: space(2), position: 'relative' }}>
      <ScrollView ref={ref} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={onScroll} onScroll={Platform.OS === 'web' ? onScroll : undefined} scrollEventThrottle={64}
        style={{ width, borderRadius: radius.lg }} accessibilityLabel="Offers and collections">
        {list.map((b, k) => {
          const img = wide ? b.imageDesktop : b.imageMobile;     // never the other device's picture
          const vid = wide ? b.videoDesktop : b.videoMobile;
          return (
            <Pressable key={b.id} onPress={() => open(b.link)} accessibilityRole={b.link ? 'link' : undefined} accessibilityLabel={b.alt || b.title || 'Banner'}
              style={{ width, height: h, borderRadius: radius.lg, overflow: 'hidden' }} accessibilityHint={b.textInImage && b.title ? b.title : undefined}>
              {img ? <BannerImage src={img} fit={b.fit} focus={b.focus} />
                : <LinearGradient colors={[...gradient]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', width: '100%', height: '100%' }} />}
              {vid && k === i ? <BannerVideo src={vid} poster={b.fit === 'whole' ? null : img} muted={!(b.sound && soundOn && !b.audio)} fit={b.fit} focus={b.focus} /> : null}
              {b.audio && b.sound && k === i ? <BannerAudio src={b.audio} playing={soundOn} /> : null}
              {showText(b) ? <LinearGradient colors={['transparent', 'rgba(4,7,34,0.78)']} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '70%' }} /> : null}
              {showText(b) ? <View style={{ position: 'absolute', left: space(5), right: space(5), bottom: space(5), gap: space(1) }}>
                {b.title ? <Text v="title" color="#fff">{b.title}</Text> : null}
                {b.text ? <Text color="#E5E7FF">{b.text}</Text> : null}
                {b.cta && b.link ? <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), marginTop: space(2) }}><Text v="bodyStrong" color={colors.violet}>{b.cta} →</Text></View> : null}
              </View> : null}
              {(vid || b.audio) && b.sound && k === i ? (
                <Pressable onPress={() => { setSoundOn((x) => !x); setPausedAt(Date.now()); }} hitSlop={8} accessibilityRole="button" accessibilityLabel={soundOn ? 'Mute sound' : 'Play sound'}
                  style={{ position: 'absolute', right: space(3), bottom: space(3), width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(4,7,34,0.6)', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={soundOn ? 'volume-high' : 'volume-mute'} size={20} color="#fff" />
                </Pressable>
              ) : null}
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
  const t = useT();
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={t('shopByShape')} />
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
  const t = useT();
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={t('shopByFace')} action={t('notSureScan')} onAction={() => router.push('/tryon')} />
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
  const t = useT();
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={t('collections')} action={t('allFrames')} onAction={() => router.push('/shop')} />
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
export function RecentlyViewed({ excludeId, title }: { excludeId?: string; title?: string }) {
  const t = useT();
  const { items, init } = useRecent();
  useEffect(() => { init(); }, [init]);
  const list = items.filter((x) => x.id !== excludeId);
  if (!list.length) return null;
  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={title ?? t('recentlyViewed')} />
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
