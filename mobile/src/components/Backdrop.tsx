import { View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Soft cyan/violet light at the top of a screen. Sits behind the content. */
export function Backdrop({ height = 420 }: { height?: number }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height }}>
      <LinearGradient colors={['rgba(123,97,255,0.22)', 'rgba(123,97,255,0)']} start={{ x: 0, y: 0 }} end={{ x: 0.6, y: 1 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as ViewStyle} />
      <LinearGradient colors={['rgba(8,185,219,0.16)', 'rgba(8,185,219,0)']} start={{ x: 1, y: 0 }} end={{ x: 0.35, y: 0.9 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as ViewStyle} />
    </View>
  );
}

