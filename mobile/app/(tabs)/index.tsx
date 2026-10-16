import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLayout } from '@/lib/layout';
import { api, cachedApi } from '@/api/client';
import { Product } from '@/api/types';
import { Logo } from '@/components/Logo';
import { ProductCard } from '@/components/ProductCard';
import { ChatFab } from '@/components/ChatFab';
import { FollowInstagram } from '@/components/FollowInstagram';
import { useAuth } from '@/store/auth';
import { VoiceButton } from '@/components/VoiceButton';
import { Row, Text } from '@/components/UI';
import { colors, gradient, radius, space } from '@/theme';
import { useAppUpdate } from '@/lib/appUpdate';
import { useFeatures } from '@/lib/features';
import { Collections, HomeBanners, RecentlyViewed, ShopByFace, ShopByShape } from '@/components/HomeSections';
import { DesktopNav, ShopByOccasion } from '@/components/Discovery';

const SHAPES = [['RECTANGLE', 'Rectangle'], ['ROUND', 'Round'], ['CAT_EYE', 'Cat-eye'], ['AVIATOR', 'Aviator'], ['WAYFARER', 'Wayfarer'], ['SQUARE', 'Square']];

export default function Home() {
  const features = useFeatures();
  const { cardW, cols, wide, pad, content } = useLayout();
  const contentW = content - pad * 2;   // banner carousel width
  const [bestsellers, setBestsellers] = useState<Product[]>([]);
  const [newest, setNewest] = useState<Product[]>([]);
  const user = useAuth((st) => st.user);
  const [toReview, setToReview] = useState<{ productId: string; productName: string; orderId: string }[]>([]);
  const update = useAppUpdate((st) => st.info);
  const showUpdate = useAppUpdate((st) => st.show);
  const [insta, setInsta] = useState<string | null>(null);
  const [webTip, setWebTip] = useState<'ios' | 'android' | null>(null);
  // Web only: show iPhone users how to add Lensio to the home screen, and point Android browsers to the app.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const ua = navigator.userAgent;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone;
    if (standalone) return;
    try { if (localStorage.getItem('lensio.tip.dismissed')) return; } catch { /* ignore */ }
    if (/iPhone|iPad|iPod/i.test(ua)) setWebTip('ios'); else if (/Android/i.test(ua)) setWebTip('android');
  }, []);
  const dismissTip = () => { setWebTip(null); try { localStorage.setItem('lensio.tip.dismissed', '1'); } catch { /* ignore */ } };
  // Reload whenever Home is opened, so frames added in the admin panel show up straight away.
  useFocusEffect(useCallback(() => {
    cachedApi<{ items: Product[] }>('/catalog/products?limit=10&sort=popular', (r) => setBestsellers(r.items)).then((r) => setBestsellers(r.items)).catch(() => {});
    cachedApi<{ items: Product[] }>('/catalog/products?limit=10&sort=new', (r) => setNewest(r.items)).then((r) => setNewest(r.items)).catch(() => {});
    if (user) api<{ productId: string; productName: string; orderId: string }[]>('/reviews/pending').then(setToReview).catch(() => {});
  }, [user?.id]));
  // App updates are checked by <UpdatePrompt /> (root layout); Home keeps a banner while one is waiting.
  useEffect(() => {
    api<{ instagramUrl?: string | null }>('/config').then((c) => setInsta(c.instagramUrl ?? null)).catch(() => {});
  }, []);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.night }}>
      <Row style={{ paddingHorizontal: pad, paddingVertical: space(3), justifyContent: 'space-between' }}>
        <Logo variant="wordmark" height={30} />
        <Row style={{ gap: space(4) }}>
          <VoiceButton size={20} onFinal={(t) => router.push({ pathname: '/shop', params: { voice: t } })} />
          <Pressable onPress={() => router.push('/shop')} accessibilityLabel="Search"><Ionicons name="search" size={22} color={colors.text} /></Pressable>
          <Pressable onPress={() => router.push('/cart')} accessibilityLabel="Cart"><Ionicons name="bag-outline" size={22} color={colors.text} /></Pressable>
        </Row>
      </Row>
      <ScrollView contentContainerStyle={{ padding: pad, gap: space(7), paddingBottom: space(12) }}>
        {webTip ? (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space(4), gap: space(2) }}>
            <Text v="bodyStrong">{webTip === 'ios' ? 'Add Lensio to your Home Screen' : 'Get the Lensio Android app'}</Text>
            <Text v="caption" color={colors.muted}>
              {webTip === 'ios' ? 'Tap the Share button in Safari, then "Add to Home Screen". Lensio then opens like an app.' : 'Faster, with camera try-on. Free download, no Play Store needed.'}
            </Text>
            <Row style={{ gap: space(4) }}>
              {webTip === 'android' ? <Pressable onPress={() => Linking.openURL('/download')}><Text v="caption" color={colors.cyan}>Download the app</Text></Pressable> : null}
              <Pressable onPress={dismissTip}><Text v="caption" color={colors.muted}>Not now</Text></Pressable>
            </Row>
          </View>
        ) : null}
        {toReview.length ? (
          <Pressable onPress={() => toReview.length === 1
              ? router.push({ pathname: '/review/new', params: { productId: toReview[0].productId, orderId: toReview[0].orderId, name: toReview[0].productName } })
              : router.push('/rewards')}
            style={{ backgroundColor: colors.surface, borderColor: '#F5A524', borderWidth: 1, borderRadius: radius.md, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Text style={{ fontSize: 26, color: '#F5A524' }}>★</Text>
            <View style={{ flex: 1 }}>
              <Text v="bodyStrong">How are your {toReview[0].productName}?</Text>
              <Text v="caption" color={colors.muted}>{toReview.length > 1 ? `Rate your ${toReview.length} recent frames. It takes a minute` : 'Tap to rate them and help other shoppers choose'}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
        {update ? (
          <Pressable onPress={showUpdate} accessibilityRole="button"
            style={{ backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, borderRadius: radius.md, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Ionicons name="arrow-down-circle-outline" size={26} color={colors.cyan} />
            <View style={{ flex: 1 }}><Text v="bodyStrong">Update available: version {update.version}</Text><Text v="caption" color={colors.muted}>Tap to update. Your account and orders stay.</Text></View>
          </Pressable>
        ) : null}
        <HomeBanners width={contentW} />
        <ScanHero />
        <FeatureTiles />
        <DesktopNav />
        <Collections />
        {/* Hero: the one place the brand gradient gets room to breathe */}
        <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: radius.lg, padding: 1.5 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: radius.lg - 1.5, padding: wide ? space(8) : space(5), gap: space(3) }}>
            <Text v="display" style={{ maxWidth: 620 }}>Frames with lenses, made to your prescription</Text>
            <Text color={colors.muted} style={{ maxWidth: 620 }}>10% off your first frame + lens combo with code FIRST10.</Text>
            <Row style={{ marginTop: space(2) }}>
              <Pressable onPress={() => router.push('/shop')} style={{ backgroundColor: colors.text, borderRadius: radius.pill, paddingHorizontal: space(5), paddingVertical: space(3) }}>
                <Text v="bodyStrong" color={colors.night}>Shop eyeglasses</Text>
              </Pressable>
              <Pressable onPress={() => router.push('/tryon')} style={{ paddingHorizontal: space(3), paddingVertical: space(3) }}>
                <Text v="bodyStrong" color={colors.cyan}>Try frames on</Text>
              </Pressable>
            </Row>
          </View>
        </LinearGradient>

        <View style={{ gap: space(3) }}>
          <Text v="title">Shop by shape</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2.5) }}>
            {SHAPES.map(([k, label]) => (
              <Pressable key={k} onPress={() => router.push({ pathname: '/shop', params: { shape: k } })}
                style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: space(4), paddingVertical: space(3), backgroundColor: colors.surface }}>
                <Text v="bodyStrong">{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
          {[
            ...(features.eyeTest ? [{ icon: 'home-outline' as const, t: 'Eye test at home', to: '/eye-test' }] : []),
            { icon: 'document-text-outline' as const, t: 'Upload prescription', to: '/prescription/new' },
            { icon: 'scan-outline' as const, t: 'Try frames on', to: '/tryon' },
            ...(features.stores ? [{ icon: 'location-outline' as const, t: 'Find a store', to: '/stores' }] : []),
          ].map((c) => (
            <Pressable key={c.t} onPress={() => router.push(c.to)} style={{ flexGrow: 1, flexBasis: wide ? '22%' : '45%', backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.line }}>
              <Ionicons name={c.icon} size={22} color={colors.cyan} />
              <Text v="bodyStrong">{c.t}</Text>
            </Pressable>
          ))}
        </View>

        <ShopByShape />
        <ShopByFace />
        <ShopByOccasion />
        <RecentlyViewed />

        {newest.length ? (
          <View style={{ gap: space(3) }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="title">New arrivals</Text>
              <Pressable onPress={() => router.push({ pathname: '/shop', params: { sort: 'new' } })}><Text v="caption" color={colors.cyan}>See all</Text></Pressable>
            </Row>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
              {newest.slice(0, cols).map((p) => <ProductCard key={p.id} p={p} width={cardW} />)}
            </View>
          </View>
        ) : null}

        <View style={{ gap: space(3) }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="title">Bestsellers</Text>
            <Pressable onPress={() => router.push('/shop')}><Text v="caption" color={colors.cyan}>See all</Text></Pressable>
          </Row>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
            {bestsellers.slice(0, cols * 2).map((p) => <ProductCard key={p.id} p={p} width={cardW} />)}
          </View>
        </View>

        <FollowInstagram />

        <View style={{ alignItems: 'center', paddingTop: space(4), paddingBottom: space(10), opacity: 0.8 }}>
          <Logo variant="tagline" height={16} />
          {insta ? (
            <Pressable onPress={() => Linking.openURL(insta)} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(3) }} accessibilityRole="link">
              <Ionicons name="logo-instagram" size={18} color={colors.magenta} /><Text v="caption" color={colors.muted}>Follow us on Instagram</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ChatFab />
    </SafeAreaView>
  );
}

/** Animated AI face-scan banner: floating glasses and a pulsing scan ring. */
function ScanHero() {
  const float = useRef(new Animated.Value(0)).current, pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const native = Platform.OS !== 'web';
    const a = Animated.loop(Animated.sequence([
      Animated.timing(float, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(float, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ]));
    const b = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: native }));
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, [float, pulse]);
  const y = float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <Pressable onPress={() => router.push('/tryon')} accessibilityRole="button" accessibilityLabel="Start your AI face scan">
      {({ pressed }) => (
        <LinearGradient colors={['#4f46e5', '#7c3aed', '#0891b2']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ borderRadius: radius.lg, padding: space(5), flexDirection: 'row', alignItems: 'center', gap: space(4), overflow: 'hidden', transform: [{ scale: pressed ? 0.98 : 1 }] }}>
          <View style={{ flex: 1, gap: space(1) }}>
            <Text v="caption" color="#e0e7ff" style={{ letterSpacing: 1 }}>NEW · AI POWERED</Text>
            <Text v="title" color="#fff">✨ AI face scan</Text>
            <Text color="#e0e7ff">Face shape, exact frame size and PD in 10 seconds, with voice guidance. Then frames picked for you.</Text>
            <View style={{ alignSelf: 'flex-start', backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2), marginTop: space(2) }}>
              <Text v="bodyStrong" color="#4f46e5">Scan my face →</Text>
            </View>
          </View>
          <View style={{ width: 92, height: 92, alignItems: 'center', justifyContent: 'center' }}>
            <Animated.View style={{ position: 'absolute', width: 92, height: 92, borderRadius: 46, borderWidth: 2, borderColor: '#a5f3fc', opacity: ringOpacity, transform: [{ scale: ringScale }] }} />
            <Animated.View style={{ transform: [{ translateY: y }] }}>
              <Ionicons name="glasses-outline" size={56} color="#fff" />
            </Animated.View>
          </View>
        </LinearGradient>
      )}
    </Pressable>
  );
}

/** Quick feature tiles (glass style). */
function FeatureTiles() {
  const { eyeTest } = useFeatures();
  const tiles: { icon: keyof typeof Ionicons.glyphMap; title: string; sub: string; go: () => void }[] = [
    { icon: 'scan-outline', title: 'Face scan', sub: 'Shape + size', go: () => router.push('/tryon') },
    { icon: 'camera-outline', title: 'Try on', sub: 'Live 3D fit', go: () => router.push('/tryon') },
    { icon: 'git-compare-outline', title: 'Compare', sub: 'Side by side', go: () => router.push('/compare') },
    { icon: 'heart-outline', title: 'Wishlist', sub: 'Saved frames', go: () => router.push('/wishlist') },
    ...(eyeTest ? [{ icon: 'home-outline' as const, title: 'Eye test', sub: 'At home', go: () => router.push('/eye-test') }] : []),
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(3) }}>
      {tiles.map((t) => (
        <Pressable key={t.title} onPress={t.go} accessibilityRole="button" accessibilityLabel={t.title}
          style={({ pressed }) => ({ width: 112, padding: space(3), gap: space(1), borderRadius: radius.md, backgroundColor: 'rgba(21,27,77,0.62)', borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
          <Ionicons name={t.icon} size={24} color={colors.cyan} />
          <Text v="bodyStrong">{t.title}</Text>
          <Text v="caption" color={colors.muted}>{t.sub}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
