import { createElement, useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '@/api/client';
import { Button, Loading, Text } from '@/components/UI';
import { Logo } from '@/components/Logo';
import { colors, space } from '@/theme';

/**
 * AI try-on. The same page runs everywhere: the server's /try-on page does face detection,
 * automatic fitting, face-shape suggestions and capture. The web app shows it in an iframe,
 * the phone apps in a WebView.
 */
const ORIGIN = API_URL.startsWith('http') ? API_URL.replace(/\/v1\/?$/, '') : '';

export default function TryOn() {
  const { frame } = useLocalSearchParams<{ frame?: string }>();
  const src = `${ORIGIN}/try-on/?embed=1${frame ? `&frame=${encodeURIComponent(frame)}` : ''}`;
  return Platform.OS === 'web' ? <WebTryOn src={src} /> : <NativeTryOn src={src} />;
}

function onPageMessage(m: { type?: string; slug?: string; size?: string }) {
  if (m.type === 'open' && m.slug) router.push({ pathname: '/product/[slug]', params: { slug: m.slug, ...(m.size ? { size: m.size } : {}) } });
  if (m.type === 'close') router.back();
}

function WebTryOn({ src }: { src: string }) {
  useEffect(() => {
    const h = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.lensio) onPageMessage(e.data); };
    window.addEventListener('message', h);
    return () => window.removeEventListener('message', h);
  }, []);
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.night }}>
      {createElement('iframe', {
        src, title: 'Try on', allow: 'camera; microphone; web-share; clipboard-write',
        style: { border: 0, width: '100%', height: '100%', flex: 1, background: colors.night },
      })}
    </SafeAreaView>
  );
}

function NativeTryOn({ src }: { src: string }) {
  // Required here (not at the top) so the web build never loads the native camera module.
  const { useCameraPermissions } = require('expo-camera') as typeof import('expo-camera');
  const [perm, requestPerm] = useCameraPermissions();
  const [visible, setVisible] = useState(true);
  // Stop the camera when leaving the tab (the WebView unmounts).
  useFocusEffect(useCallback(() => { setVisible(true); return () => setVisible(false); }, []));

  if (!perm) return <Loading />;
  if (!perm.granted) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.night, padding: space(6), justifyContent: 'center', gap: space(5) }}>
        <Logo variant="mark" height={80} style={{ alignSelf: 'center' }} />
        <Text v="heading" style={{ textAlign: 'center' }}>See frames on your face</Text>
        <Text color={colors.muted} style={{ textAlign: 'center' }}>Allow the camera and we'll place frames on your face automatically. Nothing is recorded or uploaded.</Text>
        <Button title={perm.canAskAgain ? 'Allow camera' : 'Open settings'} onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())} />
      </SafeAreaView>
    );
  }
  if (!visible) return <View style={{ flex: 1, backgroundColor: colors.night }} />;

  // Loaded lazily so the web build never touches the native module.
  const { WebView } = require('react-native-webview') as typeof import('react-native-webview');
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.night }}>
      <WebView
        source={{ uri: src }}
        style={{ flex: 1, backgroundColor: colors.night }}
        mediaCapturePermissionGrantType="grant"
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        originWhitelist={['https://*', 'http://*']}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'capture' && m.dataUrl) saveCapture(m.dataUrl);
            else onPageMessage(m);
          } catch { /* ignore */ }
        }}
      />
    </SafeAreaView>
  );
}

/** Saves the captured try-on photo and opens the share sheet (WhatsApp, Instagram, Gallery…). */
async function saveCapture(dataUrl: string) {
  try {
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const Sharing = require('expo-sharing') as typeof import('expo-sharing');
    const uri = `${FileSystem.cacheDirectory}lensio-try-on-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(uri, dataUrl.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
    if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', dialogTitle: 'Share your Lensio try-on' });
    else Alert.alert('Saved', 'Your try-on photo was saved.');
  } catch {
    Alert.alert('Could not save the photo', 'Please try again.');
  }
}
