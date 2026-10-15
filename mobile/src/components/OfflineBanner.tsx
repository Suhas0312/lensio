import { useEffect } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNet } from '@/api/client';
import { useAuth } from '@/store/auth';
import { useWishlist } from '@/store/shopping';
import { colors, space } from '@/theme';
import { Text } from './UI';

/** “You're offline” banner (frames shown from the device), and loads the ♥ wishlist after sign-in. */
export function OfflineBanner() {
  const offline = useNet((s) => s.offline);
  const userId = useAuth((s) => s.user?.id);
  useEffect(() => { useWishlist.getState().load(); }, [userId]);
  if (!offline) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 44, alignSelf: 'center', backgroundColor: '#3b2f05', borderColor: colors.warning, borderWidth: 1, borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(4), paddingVertical: space(2) }}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text v="caption" color={colors.warning}>You're offline: showing saved frames</Text>
    </View>
  );
}
