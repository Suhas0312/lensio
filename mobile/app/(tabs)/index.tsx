import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLayout } from '@/lib/layout';
import { api } from '@/api/client';
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

const SHAPES = [['RECTANGLE', 'Rectangle'], ['ROUND', 'Round'], ['CAT_EYE', 'Cat-eye'], ['AVIATOR', 'Aviator'], ['WAYFARER', 'Wayfarer'], ['SQUARE', 'Square']];

export default function Home() {
  const { cardW, cols, wide, pad } = useLayout();
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
    api<{ items: Product[] }>('/catalog/products?limit=10&sort=popular').then((r) => setBestsellers(r.items)).catch(() => {});
    api<{ items: Product[] }>('/catalog/products?limit=10&sort=new').then((r) => setNewest(r.items)).catch(() => {});
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
            { icon: 'home-outline' as const, t: 'Eye test at home', to: '/eye-test' },
            { icon: 'document-text-outline' as const, t: 'Upload prescription', to: '/prescription/new' },
            { icon: 'scan-outline' as const, t: 'Try frames on', to: '/tryon' },
            { icon: 'location-outline' as const, t: 'Find a store', to: '/stores' },
          ].map((c) => (
            <Pressable key={c.t} onPress={() => router.push(c.to)} style={{ flexGrow: 1, flexBasis: wide ? '22%' : '45%', backgroundColor: colors.surface, borderRadius: radius.md, padding: space(4), gap: space(2), borderWidth: 1, borderColor: colors.line }}>
              <Ionicons name={c.icon} size={22} color={colors.cyan} />
              <Text v="bodyStrong">{c.t}</Text>
            </Pressable>
          ))}
        </View>

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
