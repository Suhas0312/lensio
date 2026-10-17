import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@/theme';
import { BackButton } from '@/components/BackButton';
import { useT } from '@/i18n';

type Icon = keyof typeof Ionicons.glyphMap;
const tab = (icon: Icon) => ({ tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name={icon} color={color} size={size} /> });

const back = ({ tintColor }: { tintColor?: string }) => <BackButton tint={tintColor} toHome />;

export default function TabsLayout() {
  const t = useT();
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.night }, headerTintColor: colors.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: font.bold },
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      tabBarActiveTintColor: colors.cyan, tabBarInactiveTintColor: colors.faint,
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
