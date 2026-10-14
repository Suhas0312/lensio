import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, font } from '@/theme';

type Icon = keyof typeof Ionicons.glyphMap;
const tab = (icon: Icon) => ({ tabBarIcon: ({ color, size }: { color: string; size: number }) => <Ionicons name={icon} color={color} size={size} /> });

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.night }, headerTintColor: colors.text, headerShadowVisible: false,
      headerTitleStyle: { fontFamily: font.bold },
      tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
      tabBarActiveTintColor: colors.cyan, tabBarInactiveTintColor: colors.faint,
      tabBarLabelStyle: { fontFamily: font.semibold, fontSize: 11 },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', headerShown: false, ...tab('home-outline') }} />
      <Tabs.Screen name="shop" options={{ title: 'Shop', ...tab('glasses-outline') }} />
      <Tabs.Screen name="tryon" options={{ title: 'Try on', headerShown: false, ...tab('scan-outline') }} />
      <Tabs.Screen name="orders" options={{ title: 'Orders', ...tab('cube-outline') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', ...tab('person-outline') }} />
    </Tabs>
  );
}
