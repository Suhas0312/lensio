import { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text as RNText, TextInput, TextInputProps,
  TextProps, View, ViewStyle, StyleProp, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, gradient, radius, space, type } from '@/theme';
import { webColumn } from '@/lib/layout';

type Variant = keyof typeof type;
export function Text({ v = 'body', color = colors.text, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  return <RNText {...p} style={[type[v], { color }, style]} />;
}

export function Screen({ children, scroll = true, padded = true, footer }: { children: ReactNode; scroll?: boolean; padded?: boolean; footer?: ReactNode }) {
  const inner = <View style={[{ padding: padded ? space(5) : 0, gap: space(4) }, webColumn()]}>{children}</View>;
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.night }}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space(8) }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : <View style={{ flex: 1 }}>{inner}</View>}
      {footer ? <View style={s.footer}><View style={webColumn()}>{footer}</View></View> : null}
    </SafeAreaView>
  );
}

/** Primary actions use the logo gradient; everything else stays quiet. */
export function Button({ title, onPress, kind = 'primary', loading, disabled, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'secondary' | 'ghost'; loading?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const off = disabled || loading;
  const label = loading ? <ActivityIndicator color={colors.text} /> : <Text v="bodyStrong">{title}</Text>;
  return (
    <Pressable onPress={onPress} disabled={off} accessibilityRole="button" accessibilityState={{ disabled: !!off, busy: !!loading }}
      style={({ pressed }) => [{ opacity: off ? 0.45 : pressed ? 0.85 : 1, borderRadius: radius.pill, overflow: 'hidden' }, style]}>
      {kind === 'primary' ? (
        <LinearGradient colors={gradient as unknown as string[]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={s.btn}>{label}</LinearGradient>
      ) : (
        <View style={[s.btn, kind === 'secondary' ? s.secondary : null]}>{label}</View>
      )}
    </Pressable>
  );
}

export function Field({ label, error, hint, ...p }: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <View style={{ gap: space(1.5) }}>
      <Text v="caption" color={colors.muted}>{label}</Text>
      <TextInput placeholderTextColor={colors.faint} {...p}
        style={[s.input, error ? { borderColor: colors.danger } : null, p.style]} />
      {error ? <Text v="caption" color={colors.danger}>{error}</Text> : hint ? <Text v="caption" color={colors.faint}>{hint}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!selected }}
      style={[s.chip, selected && { borderColor: colors.violet, backgroundColor: '#211C63' }]}>
      <Text v="caption" color={selected ? colors.text : colors.muted}>{label}</Text>
    </Pressable>
  );
}

/** A selectable row used across the lens flow. */
export function OptionCard({ title, subtitle, price, selected, onPress, badge }: {
  title: string; subtitle?: string; price?: string; selected?: boolean; onPress?: () => void; badge?: string;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: !!selected }}
      style={[s.card, selected && { borderColor: colors.violet }]}>
      <View style={[s.radio, selected && { borderColor: colors.violet }]}>{selected ? <View style={s.radioDot} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <Text v="bodyStrong">{title}</Text>
          {badge ? <View style={s.badge}><Text v="caption" color={colors.cyan}>{badge}</Text></View> : null}
        </View>
        {subtitle ? <Text v="caption" color={colors.muted}>{subtitle}</Text> : null}
      </View>
      {price ? <Text v="bodyStrong">{price}</Text> : null}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.panel, style]}>{children}</View>;
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space(3) }, style]}>{children}</View>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: space(14), gap: space(3) }}>
      <Text v="title">{title}</Text>
      {body ? <Text color={colors.muted} style={{ textAlign: 'center', maxWidth: 280 }}>{body}</Text> : null}
      {action}
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.night }}><ActivityIndicator color={colors.violet} /></View>;
}

const s = StyleSheet.create({
  footer: { padding: space(4), borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  btn: { minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(6) },
  secondary: { borderWidth: 1.5, borderColor: colors.line, borderRadius: radius.pill },
  input: { ...type.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: space(4), minHeight: 50 },
  chip: { paddingHorizontal: space(3.5), paddingVertical: space(2), borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  card: { flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(4), borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.faint, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  badge: { borderRadius: radius.pill, borderWidth: 1, borderColor: colors.cyan, paddingHorizontal: space(2) },
  // Glass card: translucent panel with a light edge and soft depth (frosted blur on the website).
  panel: {
    backgroundColor: 'rgba(21,27,77,0.62)', borderRadius: radius.md, padding: space(4), borderWidth: 1, borderColor: 'rgba(160,170,255,0.16)', gap: space(3),
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3,
    ...(Platform.OS === 'web' ? ({ backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)' } as object) : {}),
  },
});
