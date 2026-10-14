import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, gradient, space } from '@/theme';
import { dateTime } from '@/lib/format';
import { Text } from './UI';

export interface Stage { status: string; label: string; done: boolean; at: string | null }

/** Order progress. Completed stages share the logo gradient, like the eye's iris. */
export function Timeline({ stages }: { stages: Stage[] }) {
  const current = stages.filter((s) => s.done).length - 1;
  return (
    <View>
      {stages.map((s, i) => (
        <View key={s.status} style={{ flexDirection: 'row', gap: space(3), minHeight: 56 }}>
          <View style={{ alignItems: 'center', width: 22 }}>
            {s.done ? (
              <LinearGradient colors={gradient as unknown as string[]} style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' }}>
                {i === current ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.night }} /> : null}
              </LinearGradient>
            ) : (
              <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line }} />
            )}
            {i < stages.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: stages[i + 1].done ? colors.violet : colors.line }} /> : null}
          </View>
          <View style={{ flex: 1, paddingBottom: space(4) }}>
            <Text v={i === current ? 'bodyStrong' : 'body'} color={s.done ? colors.text : colors.faint}>{s.label}</Text>
            {s.at ? <Text v="caption" color={colors.muted}>{dateTime(s.at)}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
}
