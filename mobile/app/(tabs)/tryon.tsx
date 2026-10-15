import { createElement, useCallback, useEffect, useRef, useState } from 'react';
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
  const webRef = useRef<any>(null);
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
  const web = webRef;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.night }}>
      <WebView
        ref={web}
        source={{ uri: src }}
        // Tells the try-on page to use the app's own photo picker (Gallery / Files) for "Photo from gallery".
        injectedJavaScriptBeforeContentLoaded={'window.__lensioNativePicker = true; true;'}
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
            if (m.type === 'pickPhoto') pickPhoto((dataUrl) => web.current?.injectJavaScript(`window.__lensioUsePhoto && window.__lensioUsePhoto(${JSON.stringify(dataUrl)}); true;`));
            else if (m.type === 'speak' && m.text) speakAloud(String(m.text));
            else if (m.type === 'save' && m.dataUrl) saveToGallery(m.dataUrl);
            else if (m.type === 'capture' && m.dataUrl) saveCapture(m.dataUrl);
            else onPageMessage(m);
          } catch { /* ignore */ }
        }}
      />
    </SafeAreaView>
  );
}

/** "Photo from gallery": lets the customer choose a photo from Gallery/Photos or from Files, then hands it to the try-on page. */
function pickPhoto(send: (dataUrl: string) => void) {
  const fromGallery = async () => {
    try {
      const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { Alert.alert('Allow photos', 'To choose a photo, allow Lensio to access your photos in your phone settings.'); return; }
      const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, base64: true, exif: false });
      const a = r.canceled ? null : r.assets?.[0];
      if (a?.base64) send(`data:${a.mimeType || 'image/jpeg'};base64,${a.base64}`);
    } catch { Alert.alert('Could not open your photos', 'Please try again.'); }
  };
  const fromFiles = async () => {
    try {
      const DocumentPicker = require('expo-document-picker') as typeof import('expo-document-picker');
      const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
      const r = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true, multiple: false });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a) return;
      if ((a.size ?? 0) > 15 * 1024 * 1024) { Alert.alert('Photo too large', 'Choose a photo under 15 MB.'); return; }
      const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
      send(`data:${a.mimeType || 'image/jpeg'};base64,${b64}`);
    } catch { Alert.alert('Could not open your files', 'Please try again.'); }
  };
  Alert.alert('Choose a photo', 'Use a front-facing photo of your face, without glasses.', [
    { text: '📷 Gallery', onPress: fromGallery },
    { text: '📁 Files', onPress: fromFiles },
    { text: 'Cancel', style: 'cancel' },
  ]);
}

/** Voice guidance from the try-on (face alignment while measuring), in the phone's own voice. */
function speakAloud(text: string) {
  try {
    const Speech = require('expo-speech') as typeof import('expo-speech');
    Speech.stop();
    Speech.speak(text.slice(0, 160), { language: 'en-IN', rate: 1.0 });
  } catch { /* no voice on this phone */ }
}

/** "Save to gallery": puts the try-on photo straight into the phone's Gallery / Photos (Lensio album). */
async function saveToGallery(dataUrl: string) {
  try {
    const FileSystem = require('expo-file-system') as typeof import('expo-file-system');
    const MediaLibrary = require('expo-media-library') as typeof import('expo-media-library');
    const perm = await MediaLibrary.requestPermissionsAsync(true);
    if (!perm.granted) { Alert.alert('Allow photos', 'To save your try-on photo, allow Lensio to add photos in your phone settings.'); return; }
    const uri = `${FileSystem.cacheDirectory}lensio-try-on-${Date.now()}.jpg`;
    await FileSystem.writeAsStringAsync(uri, dataUrl.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
    const asset = await MediaLibrary.createAssetAsync(uri);
    try {
      const album = await MediaLibrary.getAlbumAsync('Lensio');
      if (album) await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
      else await MediaLibrary.createAlbumAsync('Lensio', asset, false);
    } catch { /* saved to the gallery; the album is optional */ }
    Alert.alert('Saved to your gallery', 'Find it in Gallery / Photos (Lensio album).');
  } catch {
    saveCapture(dataUrl);   // fall back to the share sheet
  }
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
