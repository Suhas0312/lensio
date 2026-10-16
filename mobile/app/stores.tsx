import { useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { api } from '@/api/client';
import { useFeatures } from '@/lib/features';
import { router } from 'expo-router';
import { Button, Card, Empty, Loading, Row, Screen, Text } from '@/components/UI';
import { colors, space } from '@/theme';

interface Store { id: string; name: string; addressLine: string; city: string; state: string; pincode: string; phone?: string | null; hours?: string | null; latitude?: number | null; longitude?: number | null; distanceKm: number | null }

/** Browser or phone location, only used to sort stores by distance. */
async function locate(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (Platform.OS === 'web') {
      return await new Promise((ok) => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition((p) => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), () => ok(null), { timeout: 8000 })
        : ok(null));
    }
    const Location = require('expo-location') as typeof import('expo-location');
    const { granted } = await Location.requestForegroundPermissionsAsync();
    if (!granted) return null;
    const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { lat: p.coords.latitude, lng: p.coords.longitude };
  } catch { return null; }
}

function StoresList() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [near, setNear] = useState(false);
  const load = (q = '') => api<Store[]>(`/stores${q}`).then(setStores).catch(() => setStores([]));
  useEffect(() => { load(); }, []);

  const nearMe = async () => {
    const pos = await locate();
    if (!pos) return;
    setNear(true); load(`?lat=${pos.lat}&lng=${pos.lng}`);
  };
  const directions = (s: Store) => {
    const q = s.latitude != null && s.longitude != null ? `${s.latitude},${s.longitude}` : encodeURIComponent(`${s.name}, ${s.addressLine}, ${s.city} ${s.pincode}`);
    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
  };

  if (!stores) return <Loading />;
  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="heading">Lensio stores</Text>
        {!near && stores.some((s) => s.latitude != null) ? <Button kind="secondary" title="📍 Near me" onPress={nearMe} /> : null}
      </Row>
      <Text color={colors.muted}>Visit us to try frames in person, get your eyes tested, or pick up your order.</Text>
      {stores.length ? stores.map((s) => (
        <Card key={s.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="title" style={{ flex: 1 }}>{s.name}</Text>
            {s.distanceKm != null ? <Text v="caption" color={colors.cyan}>{s.distanceKm < 1 ? `${Math.round(s.distanceKm * 1000)} m` : `${s.distanceKm.toFixed(1)} km`}</Text> : null}
          </Row>
          <Text color={colors.muted}>{s.addressLine}, {s.city}, {s.state} {s.pincode}</Text>
          {s.hours ? <Text v="caption" color={colors.faint}>🕒 {s.hours}</Text> : null}
          <Row style={{ gap: space(2) }}>
            <View style={{ flex: 1 }}><Button title="Directions" onPress={() => directions(s)} /></View>
            {s.phone ? <View style={{ flex: 1 }}><Button kind="secondary" title="📞 Call" onPress={() => Linking.openURL(`tel:${s.phone}`)} /></View> : null}
          </Row>
        </Card>
      )) : <Empty title="Stores coming soon" body="We're online for now. Chat with us on WhatsApp for help." />}
    </Screen>
  );
}

/** Shown only while "Find a store" is switched on in admin → Settings. */
export default function Stores() {
  const features = useFeatures();
  if (!features.loaded) return <Loading />;
  if (!features.stores) return <Empty title="We're online only right now" body="Frames are delivered to your door. Questions? Ask Lensio or chat with us on WhatsApp." action={<Button title="Browse frames" onPress={() => router.replace('/(tabs)/shop')} />} />;
  return <StoresList />;
}
