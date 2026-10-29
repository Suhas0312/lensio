import { ReactNode } from 'react';
import { Platform, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradient, radius, space } from '@/theme';
import { Text } from './UI';
export { Backdrop } from './Backdrop';

/**
 * Premium building blocks shared by every screen, so the whole app looks like one product:
 * a soft brand glow behind screens, gradient icon badges, round glass icon buttons and section headers.
 */

type IconName = keyof typeof Ionicons.glyphMap;
const web = (o: object) => (Platform.OS === 'web' ? (o as ViewStyle) : {});

/** Icon inside a softly glowing gradient circle. */
export function IconBadge({ icon, size = 44, color = colors.text }: { icon: IconName; size?: number; color?: string }) {
  return (
    <LinearGradient colors={['rgba(8,185,219,0.30)', 'rgba(123,97,255,0.30)', 'rgba(201,78,242,0.24)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(170,180,255,0.22)' }, web({ boxShadow: '0 6px 18px rgba(123,97,255,0.25)' })]}>
      <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
    </LinearGradient>
  );
}

/** Round glass button for header icons (search, cart…). */
export function IconButton({ icon, onPress, label, size = 44, badge }: { icon: IconName; onPress?: () => void; label: string; size?: number; badge?: number }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(21,27,77,0.7)', borderWidth: 1, borderColor: 'rgba(160,170,255,0.18)', transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Ionicons name={icon} size={Math.round(size * 0.46)} color={colors.text} />
      {badge ? (
        <LinearGradient colors={gradient as unknown as string[]} style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
          <Text v="caption" style={{ fontSize: 10.5, lineHeight: 14 }}>{badge > 9 ? '9+' : String(badge)}</Text>
        </LinearGradient>
      ) : null}
    </Pressable>
  );
}

/** Section header: title with a small gradient accent, and an optional "See all" link. */
export function SectionHeader({ title, action, onAction, sub }: { title: string; action?: string; onAction?: () => void; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space(3) }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={{ width: 4, height: 18, borderRadius: 2 }} />
          <Text v="title">{title}</Text>
        </View>
        {sub ? <Text v="caption" color={colors.muted} style={{ marginLeft: space(3) }}>{sub}</Text> : null}
      </View>
      {action ? (
        <Pressable onPress={onAction} accessibilityRole="link" hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
          <Text v="caption" color={colors.cyan}>{action}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.cyan} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** Card with a thin brand-gradient edge, for the most important panels. */
export function GlowCard({ children, style, inner }: { children: ReactNode; style?: StyleProp<ViewStyle>; inner?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={['rgba(8,185,219,0.9)', 'rgba(123,97,255,0.9)', 'rgba(201,78,242,0.9)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
      style={[{ borderRadius: radius.lg, padding: 1.5 }, web({ boxShadow: '0 18px 50px rgba(123,97,255,0.22)' }), style]}>
      <View style={[{ backgroundColor: '#0B1036', borderRadius: radius.lg - 1.5, overflow: 'hidden' }, inner]}>{children}</View>
    </LinearGradient>
  );
}
