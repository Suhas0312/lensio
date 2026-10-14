import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '@/api/client';
import { radius, space } from '@/theme';
import { Text } from './UI';

let cached: string | null | undefined;
/** The shop's Instagram link from /v1/config (cached for the session). */
export function useInstagram() {
  const [url, setUrl] = useState<string | null>(cached ?? null);
  useEffect(() => {
    if (cached !== undefined) return;
    api<{ instagramUrl?: string | null }>('/config').then((c) => { cached = c.instagramUrl ?? null; setUrl(cached); }).catch(() => {});
  }, []);
  return url;
}
const handle = (url: string) => '@' + (url.replace(/\/+$/, '').split('/').pop() ?? 'lensio');

/** "Follow us on Instagram" card in Instagram's colours. Hidden until the link is set in admin Settings. */
export function FollowInstagram({ title = 'Follow us on Instagram', subtitle = 'New frames, offers and styling ideas every week' }: { title?: string; subtitle?: string }) {
  const url = useInstagram();
  if (!url) return null;
  return (
    <Pressable onPress={() => Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`${title} ${handle(url)}`}>
      <LinearGradient colors={['#F58529', '#DD2A7B', '#8134AF', '#515BD4']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
        style={{ borderRadius: radius.md, padding: space(4), flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
        <Ionicons name="logo-instagram" size={32} color="#fff" />
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong" color="#fff">{title}</Text>
          <Text v="caption" color="#fff">{handle(url)} · {subtitle}</Text>
        </View>
        <View style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space(3.5), paddingVertical: space(2) }}>
          <Text v="caption" color="#8134AF">Follow</Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
