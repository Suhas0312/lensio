import 'react-native-gesture-handler';
import '@/lib/webPolyfills';
import '@/i18n/alerts';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts, Quicksand_500Medium, Quicksand_600SemiBold, Quicksand_700Bold } from '@expo-google-fonts/quicksand';
import { useAuth } from '@/store/auth';
import { UpdatePrompt } from '@/components/UpdatePrompt';
import { OfflineBanner } from '@/components/OfflineBanner';
import { BackButton } from '@/components/BackButton';
import { colors, font } from '@/theme';
import { useLang, useTr } from '@/i18n';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Quicksand_500Medium, Quicksand_600SemiBold, Quicksand_700Bold });
  const { ready, user, boot } = useAuth();
  const segments = useSegments();
  const tr = useTr();

  useEffect(() => { boot(); useLang.getState().init(); }, [boot]);
  useEffect(() => { if (fontsLoaded && ready) SplashScreen.hideAsync(); }, [fontsLoaded, ready]);

  // Browsing is open to everyone; sign-in is asked for at cart/checkout/orders.
  useEffect(() => {
    if (!ready) return;
    const inAuth = segments[0] === '(auth)';
    if (user && inAuth) router.replace('/(tabs)');
  }, [ready, user, segments]);

  if (!fontsLoaded || !ready) return null;

  const app = (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.night }}>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerStyle: { backgroundColor: colors.night }, headerTintColor: colors.text, headerShadowVisible: false,
        headerTitleStyle: { fontFamily: font.bold }, contentStyle: { backgroundColor: colors.night }, headerBackTitleVisible: false,
        animation: 'slide_from_right', animationDuration: 260, gestureEnabled: true,
        headerLeft: ({ tintColor }) => <BackButton tint={tintColor} />,   // always visible, even on a direct link
      }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="(auth)/login" options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="product/[slug]" options={{ title: '' }} />
        <Stack.Screen name="lens/[variantId]" options={{ title: tr('Choose lenses') }} />
        <Stack.Screen name="prescription/new" options={{ title: tr('Add prescription') }} />
        <Stack.Screen name="cart" options={{ title: tr('Cart') }} />
        <Stack.Screen name="checkout" options={{ title: tr('Checkout') }} />
        <Stack.Screen name="order/[id]" options={{ title: tr('Order') }} />
        <Stack.Screen name="address/new" options={{ title: tr('New address') }} />
        <Stack.Screen name="assistant" options={{ title: tr('Lensio assistant') }} />
        <Stack.Screen name="review/new" options={{ title: tr('Write a review') }} />
        <Stack.Screen name="wishlist" options={{ title: tr('My wishlist') }} />
        <Stack.Screen name="compare" options={{ title: tr('Compare frames') }} />
        <Stack.Screen name="stores" options={{ title: tr('Find a store') }} />
        <Stack.Screen name="eye-test" options={{ title: tr('Eye test at home') }} />
        <Stack.Screen name="rewards" options={{ title: tr('Lensio Rewards') }} />
      </Stack>
      <UpdatePrompt />
      <OfflineBanner />
    </GestureHandlerRootView>
  );

  // On the web the app fills the whole window, at any monitor size.
  if (Platform.OS !== 'web') return app;
  return <View style={{ flex: 1, width: '100%', overflow: 'hidden', backgroundColor: colors.night }}>{app}</View>;
}
