import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, ScrollView, View } from 'react-native';
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
import { Collections, RecentlyViewed, ShopByFace, ShopByShape } from '@/components/HomeSections';
import { DesktopNav, ShopByOccasion } from '@/components/Discovery';
import { Backdrop, GlowCard, IconBadge, IconButton, SectionHeader } from '@/components/Premium';
import { useT } from '@/i18n';


export default function Home() {
  const features = useFeatures();
  const t = useT();
  const { cardW, cols, wide, pad, content } = useLayout();
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
      <Backdrop height={520} />
      <Row style={{ paddingHorizontal: pad, paddingVertical: space(3), justifyContent: 'space-between' }}>
        <Logo variant="wordmark" height={30} />
        <Row style={{ gap: space(2.5) }}>
          <VoiceButton size={20} onFinal={(t) => router.push({ pathname: '/shop', params: { voice: t } })} />
          <IconButton icon="search" label={t('search')} onPress={() => router.push('/shop')} />
          <IconButton icon="bag-handle-outline" label={t('cart')} onPress={() => router.push('/cart')} />
        </Row>
      </Row>
      <ScrollView contentContainerStyle={{ padding: pad, gap: space(7), paddingBottom: space(12) }}>
        {webTip ? (
          <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.md, padding: space(4), gap: space(2) }}>
            <Text v="bodyStrong">{webTip === 'ios' ? t('tipIosTitle') : t('tipAndroidTitle')}</Text>
            <Text v="caption" color={colors.muted}>
              {webTip === 'ios' ? t('tipIosBody') : t('tipAndroidBody')}
            </Text>
            <Row style={{ gap: space(4) }}>
              {webTip === 'android' ? <Pressable onPress={() => Linking.openURL('/download')}><Text v="caption" color={colors.cyan}>{t('downloadApp')}</Text></Pressable> : null}
              <Pressable onPress={dismissTip}><Text v="caption" color={colors.muted}>{t('notNow')}</Text></Pressable>
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
              <Text v="bodyStrong">{t('reviewAsk', { name: toReview[0].productName })}</Text>
              <Text v="caption" color={colors.muted}>{toReview.length > 1 ? t('reviewMany', { n: toReview.length }) : t('reviewOne')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Pressable>
        ) : null}
        {update ? (
          <Pressable onPress={showUpdate} accessibilityRole="button"
            style={{ backgroundColor: colors.surface, borderColor: colors.cyan, borderWidth: 1, borderRadius: radius.md, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Ionicons name="arrow-down-circle-outline" size={26} color={colors.cyan} />
            <View style={{ flex: 1 }}><Text v="bodyStrong">{t('updateAvailable', { v: update.version })}</Text><Text v="caption" color={colors.muted}>{t('updateNote')}</Text></View>
          </Pressable>
        ) : null}
        {/* Hero: the one place the brand gradient gets room to breathe */}
        <GlowCard inner={{ padding: wide ? space(9) : space(6), gap: space(4) }}>
          <LinearGradient colors={['rgba(123,97,255,0.35)', 'rgba(123,97,255,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.2, y: 0.9 }}
            style={{ position: 'absolute', top: 0, right: 0, width: '70%', height: '100%' }} pointerEvents="none" />
          <Ionicons name="glasses-outline" size={wide ? 220 : 150} color="rgba(255,255,255,0.06)" style={{ position: 'absolute', right: -18, bottom: -30 }} />
          <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space(1.5), backgroundColor: 'rgba(8,185,219,0.14)', borderWidth: 1, borderColor: 'rgba(8,185,219,0.4)', borderRadius: radius.pill, paddingHorizontal: space(3), paddingVertical: space(1) }}>
            <Ionicons name="sparkles" size={13} color={colors.cyan} />
            <Text v="caption" color={colors.cyan}>{t('heroOffer', { code: 'FIRST10' })}</Text>
          </View>
          <Text v="display" style={{ maxWidth: 560, fontSize: wide ? 40 : 30, lineHeight: wide ? 46 : 36 }}>{t('heroTitle')}</Text>
          <Row style={{ marginTop: space(1), flexWrap: 'wrap', gap: space(3) }}>
            <Pressable onPress={() => router.push('/shop')} style={({ pressed }) => ({ borderRadius: radius.pill, overflow: 'hidden', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(6), paddingVertical: space(3.5) }}>
                <Text v="bodyStrong">{t('shopEyeglasses')}</Text>
                <Ionicons name="arrow-forward" size={18} color={colors.text} />
              </LinearGradient>
            </Pressable>
            <Pressable onPress={() => router.push('/tryon')} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(2), borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(160,170,255,0.3)', backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: space(5), paddingVertical: space(3.5), transform: [{ scale: pressed ? 0.97 : 1 }] })}>
              <Ionicons name="scan-outline" size={18} color={colors.cyan} />
              <Text v="bodyStrong">{t('tryFramesOn')}</Text>
            </Pressable>
          </Row>
        </GlowCard>

        <QuickActions />
        <DesktopNav />
        <Collections />

        <ShopByShape />
        <ShopByFace />
        <ShopByOccasion />
        <RecentlyViewed />

        {newest.length ? (
          <View style={{ gap: space(3) }}>
            <SectionHeader title={t('newArrivals')} action={t('seeAll')} onAction={() => router.push({ pathname: '/shop', params: { sort: 'new' } })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
              {newest.slice(0, cols).map((p) => <ProductCard key={p.id} p={p} width={cardW} />)}
            </View>
          </View>
        ) : null}

        <View style={{ gap: space(3) }}>
          <SectionHeader title={t('bestsellers')} action={t('seeAll')} onAction={() => router.push('/shop')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3) }}>
            {bestsellers.slice(0, cols * 2).map((p) => <ProductCard key={p.id} p={p} width={cardW} />)}
          </View>
        </View>

        <FollowInstagram />

        <View style={{ alignItems: 'center', paddingTop: space(4), paddingBottom: space(10), opacity: 0.8 }}>
          <Logo variant="tagline" height={16} />
          {insta ? (
            <Pressable onPress={() => Linking.openURL(insta)} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), marginTop: space(3) }} accessibilityRole="link">
              <Ionicons name="logo-instagram" size={18} color={colors.magenta} /><Text v="caption" color={colors.muted}>{t('followInsta')}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <ChatFab />
    </SafeAreaView>
  );
}

/** Quick actions: one tidy grid of the app's main tools, each with a glowing icon. */
function QuickActions() {
  const { eyeTest, stores } = useFeatures();
  const { wide } = useLayout();
  const t = useT();
  const items: { icon: keyof typeof Ionicons.glyphMap; title: string; to: string }[] = [
    { icon: 'scan-outline', title: t('tryon'), to: '/tryon' },
    { icon: 'happy-outline', title: t('faceScan'), to: '/tryon' },
    { icon: 'document-text-outline', title: t('uploadPrescription'), to: '/prescription/new' },
    { icon: 'git-compare-outline', title: t('compare'), to: '/compare' },
    { icon: 'heart-outline', title: t('wishlist'), to: '/wishlist' },
    ...(eyeTest ? [{ icon: 'eye-outline' as const, title: t('eyeTestShort'), to: '/eye-test' }] : []),
    ...(stores ? [{ icon: 'location-outline' as const, title: t('findStore'), to: '/stores' }] : []),
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(4), columnGap: space(2) }}>
      {items.map((x) => (
        <Pressable key={x.title} onPress={() => router.push(x.to as never)} accessibilityRole="button" accessibilityLabel={x.title}
          style={({ pressed }) => ({ width: wide ? 104 : '23%', alignItems: 'center', gap: space(2), transform: [{ scale: pressed ? 0.94 : 1 }] })}>
          <IconBadge icon={x.icon} size={wide ? 58 : 54} />
          <Text v="caption" color={colors.text} numberOfLines={2} style={{ textAlign: 'center' }}>{x.title}</Text>
        </Pressable>
      ))}
    </View>
  );
}
