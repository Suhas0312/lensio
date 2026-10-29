import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@/theme';
import { BackButton } from '@/components/BackButton';
import { useT } from '@/i18n';

type Icon = keyof typeof Ionicons.glyphMap;
/** Tab icon: outline normally; filled on a soft gradient pill when it's the open tab. */
const tab = (icon: Icon) => ({
  tabBarIcon: ({ color, size, focused }: { color: string; size: number; focused: boolean }) => {
    const filled = String(icon).replace(/-outline$/, '') as Icon;
    return focused ? (
      <LinearGradient colors={['rgba(8,185,219,0.28)', 'rgba(123,97,255,0.32)']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ paddingHorizontal: 16, paddingVertical: 4, borderRadius: 999 }}>
        <Ionicons name={filled} color={colors.text} size={size - 2} />
      </LinearGradient>
    ) : <View style={{ paddingVertical: 4 }}><Ionicons name={icon} color={color} size={size - 2} /></View>;
  },
});

const back = ({ tintColor }: { tintColor?: string }) => <BackButton tint={tintColor} toHome />;

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.night }, headerTintColor: colors.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: font.bold },
      tabBarStyle: { backgroundColor: 'rgba(7,10,38,0.97)', borderTopColor: 'rgba(160,170,255,0.14)', height: Platform.OS === 'web' ? 68 : undefined, paddingTop: 6 },
      tabBarActiveTintColor: colors.text, tabBarInactiveTintColor: colors.faint,
      tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: t('home'), headerShown: false, ...tab('home-outline') }} />
      <Tabs.Screen name="shop" options={{ title: t('shop'), headerLeft: back, ...tab('glasses-outline') }} />
      <Tabs.Screen name="tryon" options={{ title: t('tryon'), headerShown: false, ...tab('scan-outline') }} />
      <Tabs.Screen name="orders" options={{ title: t('orders'), headerLeft: back, ...tab('cube-outline') }} />
      <Tabs.Screen name="account" options={{ title: t('account'), headerLeft: back, ...tab('person-outline') }} />
    </Tabs>
  );
}
