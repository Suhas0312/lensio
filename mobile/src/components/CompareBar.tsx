import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCompare } from '@/store/shopping';
import { colors, radius, space } from '@/theme';
import { Text } from './UI';

/** Floating “Compare (2)” bar shown while frames are picked for comparison. */
export function CompareBar() {
  const { items, init, clear } = useCompare();
  useEffect(() => { init(); }, [init]);
  if (!items.length) return null;
  return (
    <View style={{ position: 'absolute', left: space(4), right: space(4), bottom: space(4), backgroundColor: colors.violet, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', paddingLeft: space(4), shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 }}>
      <Ionicons name="git-compare-outline" size={20} color="#fff" />
      <Text v="bodyStrong" color="#fff" style={{ flex: 1, marginLeft: space(2) }}>{items.length} of 3 frames to compare</Text>
      <Pressable onPress={clear} hitSlop={8} style={{ padding: space(3) }} accessibilityLabel="Clear compare list"><Text color="#e9e5ff">Clear</Text></Pressable>
      <Pressable onPress={() => router.push('/compare')} style={{ backgroundColor: '#fff', borderRadius: radius.pill, paddingHorizontal: space(5), paddingVertical: space(3), margin: 4 }} accessibilityRole="button">
        <Text v="bodyStrong" color={colors.violet}>Compare</Text>
      </Pressable>
    </View>
  );
}
