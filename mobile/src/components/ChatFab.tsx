import { Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { gradient, space } from '@/theme';
import { Text } from './UI';

/** Floating "Ask Lensio" button that opens the AI assistant. */
export function ChatFab() {
  return (
    <Pressable onPress={() => router.push('/assistant')} accessibilityRole="button" accessibilityLabel="Ask the Lensio assistant"
      style={{ position: 'absolute', right: space(4), bottom: space(4), borderRadius: 999, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 }}>
      <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), paddingHorizontal: space(4), height: 50 }}>
        <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
        <Text v="bodyStrong">Ask Lensio</Text>
      </LinearGradient>
    </Pressable>
  );
}
