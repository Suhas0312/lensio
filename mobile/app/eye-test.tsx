import { useCallback, useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFeatures } from '@/lib/features';
import { router, useFocusEffect } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Card, Chip, Empty, Field, Loading, Row, Screen, Text } from '@/components/UI';
import { colors, space } from '@/theme';

const SLOTS = ['Morning (9am-12pm)', 'Afternoon (12pm-4pm)', 'Evening (4pm-8pm)'] as const;
interface Req { id: string; preferredDate: string; preferredSlot: string; status: string; scheduledFor?: string | null; city: string }
const STATUS: Record<string, string> = { REQUESTED: 'We\'ll call you to confirm', SCHEDULED: 'Visit booked', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };

/** Book a home eye-test visit. The shop calls to confirm the time. */
function EyeTestBooking() {
  const user = useAuth((s) => s.user);
  const [f, setF] = useState({ fullName: user?.name ?? '', phone: '', addressLine: '', city: '', pincode: '', notes: '' });
  const [day, setDay] = useState(1);
  const [slot, setSlot] = useState<typeof SLOTS[number]>(SLOTS[0]);
  const [mine, setMine] = useState<Req[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i + 1); d.setHours(10, 0, 0, 0); return d; }), []);
  useFocusEffect(useCallback(() => { if (user) api<Req[]>('/eye-test/mine').then(setMine).catch(() => {}); }, [user]));

  if (!user) return <Screen><Card><Text v="title">Sign in to book an eye test</Text><Button title="Sign in" onPress={() => router.push('/(auth)/login')} /></Card></Screen>;

  const bind = (k: keyof typeof f) => ({ value: f[k], onChangeText: (t: string) => setF({ ...f, [k]: t }), error: errors[k]?.[0] });
  const submit = async () => {
    setBusy(true); setErrors({});
    try {
      await api('/eye-test', { body: { ...f, phone: f.phone.replace(/\D/g, '').slice(-10), notes: f.notes || undefined, preferredDate: days[day - 1].toISOString(), preferredSlot: slot } });
      Alert.alert('Request received', "We'll call you to confirm your eye-test visit.");
      setMine(await api<Req[]>('/eye-test/mine'));
    } catch (e) {
      const err = e as ApiError;
      if (err.details?.fieldErrors) setErrors(err.details.fieldErrors); else Alert.alert('Could not send request', err.message);
    } finally { setBusy(false); }
  };

  return (
    <Screen footer={<Button title="Request a home visit" onPress={submit} loading={busy} />}>
      <Card style={{ borderColor: colors.cyan }}>
        <Text v="title">Eye test at your home</Text>
        <Text color={colors.muted}>An optometrist visits you to check your eyes and help you choose frames. Pick a day and time that suits you, and we'll call to confirm.</Text>
      </Card>

      {mine.filter((m) => m.status !== 'CANCELLED').map((m) => (
        <Card key={m.id}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="bodyStrong">{new Date(m.scheduledFor ?? m.preferredDate).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}{m.scheduledFor ? ` · ${new Date(m.scheduledFor).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : ` · ${m.preferredSlot}`}</Text>
            <Text v="caption" color={m.status === 'SCHEDULED' ? colors.success : colors.warning}>{STATUS[m.status]}</Text>
          </Row>
        </Card>
      ))}

      <Text v="bodyStrong">Choose a day</Text>
      <Row style={{ flexWrap: 'wrap', gap: space(2) }}>
        {days.map((d, i) => <Chip key={i} label={d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} selected={day === i + 1} onPress={() => setDay(i + 1)} />)}
      </Row>
      <Text v="bodyStrong">Time</Text>
      <Row style={{ flexWrap: 'wrap', gap: space(2) }}>
        {SLOTS.map((s) => <Chip key={s} label={s} selected={slot === s} onPress={() => setSlot(s)} />)}
      </Row>
      <Field label="Full name" {...bind('fullName')} />
      <Field label="Mobile number" {...bind('phone')} keyboardType="phone-pad" maxLength={13} />
      <Field label="Address" {...bind('addressLine')} placeholder="House, street, area" />
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="City" {...bind('city')} /></View>
        <View style={{ flex: 1 }}><Field label="PIN code" {...bind('pincode')} keyboardType="number-pad" maxLength={6} /></View>
      </Row>
      <Field label="Anything we should know? (optional)" {...bind('notes')} placeholder="e.g. For 2 people, I wear progressive lenses" />
    </Screen>
  );
}

/** Shown only when the shop switches on "Eye test at home" in admin → Settings. */
export default function EyeTest() {
  const features = useFeatures();
  if (!features.loaded) return <Loading />;
  if (!features.eyeTest) {
    return <Empty title="Eye tests at home aren't available right now" body="You can get your eyes tested at any optician and upload your prescription under Account → Prescriptions." action={<Button title="Upload a prescription" onPress={() => router.push('/prescription/new')} />} />;
  }
  return <EyeTestBooking />;
}
