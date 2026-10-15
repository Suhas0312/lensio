import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/theme';

/**
 * ← Back, on every screen. Goes to the previous screen; when there is none (a link opened directly,
 * or a tab), it goes to Home, so customers are never stuck.
 */
export function BackButton({ tint, toHome }: { tint?: string; toHome?: boolean }) {
  const go = () => {
    if (!toHome && router.canGoBack()) router.back();
    else router.navigate('/(tabs)');
  };
  return (
    <Pressable onPress={go} hitSlop={12} accessibilityRole="button" accessibilityLabel={toHome ? 'Back to Home' : 'Go back'}
      style={({ pressed }) => ({ paddingHorizontal: 12, paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
      <Ionicons name="arrow-back" size={24} color={tint ?? colors.text} />
    </Pressable>
  );
}
