import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { Address } from '@/api/types';
import { useAuth } from '@/store/auth';
import { Button, Field, Loading, Row, Screen, Text } from '@/components/UI';
import { colors, space } from '@/theme';

type Form = { fullName: string; phone: string; altPhone: string; line1: string; line2: string; landmark: string; city: string; state: string; pincode: string; isDefault: boolean };
const digits = (t: string) => t.replace(/\D/g, '');
const mobileOk = (t: string) => /^[6-9]\d{9}$/.test(digits(t).replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, ''));

/** Add or edit a delivery address. Fields marked * are required (like Lenskart / Specsmakers). */
export default function AddressForm() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const user = useAuth((s) => s.user);
  const [f, setF] = useState<Form>({ fullName: user?.name ?? '', phone: user?.phone ?? '', altPhone: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', isDefault: false });
  const [loaded, setLoaded] = useState(!id);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [pinNote, setPinNote] = useState<string>();
  const lastPin = useRef('');

  // Editing: load the saved address.
  useEffect(() => {
    if (!id) return;
    api<Address[]>('/auth/addresses').then((list) => {
      const a = list.find((x) => x.id === id);
      if (a) setF({ fullName: a.fullName, phone: a.phone, altPhone: a.altPhone ?? '', line1: a.line1, line2: a.line2 ?? '', landmark: a.landmark ?? '', city: a.city, state: a.state, pincode: a.pincode, isDefault: a.isDefault });
      lastPin.current = a?.pincode ?? '';
    }).finally(() => setLoaded(true));
  }, [id]);

  // PIN code → city and state.
  useEffect(() => {
    const pin = f.pincode;
    if (!/^[1-9]\d{5}$/.test(pin) || pin === lastPin.current) return;
    lastPin.current = pin; setPinNote('Finding your city…');
    api<{ found: boolean; city?: string; state?: string }>(`/auth/pincode/${pin}`).then((r) => {
      if (r.found && r.city && r.state) { setF((x) => ({ ...x, city: r.city!, state: r.state! })); setPinNote(undefined); setErrors((e) => ({ ...e, city: '', state: '', pincode: '' })); }
      else setPinNote("We couldn't find this PIN code. Check it, or type the city and state.");
    }).catch(() => setPinNote(undefined));
  }, [f.pincode]);

  const set = (k: keyof Form) => (t: string) => { setF((x) => ({ ...x, [k]: t })); if (errors[k]) setErrors((e) => ({ ...e, [k]: '' })); };
  const bind = (k: Exclude<keyof Form, 'isDefault'>) => ({ value: f[k], onChangeText: set(k), error: errors[k] || undefined });

  const check = () => {
    const e: Record<string, string> = {};
    if (f.fullName.trim().length < 2) e.fullName = 'Enter the full name';
    if (!mobileOk(f.phone)) e.phone = 'Enter a valid 10-digit mobile number';
    if (f.altPhone.trim() && !mobileOk(f.altPhone)) e.altPhone = 'Enter a valid 10-digit number, or leave it empty';
    if (f.line1.trim().length < 3) e.line1 = 'Enter house / flat number and street';
    if (!/^[1-9]\d{5}$/.test(f.pincode)) e.pincode = 'Enter a valid 6-digit PIN code';
    if (f.city.trim().length < 2) e.city = 'Enter the city';
    if (f.state.trim().length < 2) e.state = 'Enter the state';
    setErrors(e);
    return !Object.keys(e).length;
  };

  const save = async () => {
    if (!check()) return;
    setBusy(true);
    try {
      const body = { ...f, altPhone: f.altPhone.trim() || undefined, line2: f.line2.trim() || undefined, landmark: f.landmark.trim() || undefined };
      await api(id ? `/auth/addresses/${id}` : '/auth/addresses', { method: id ? 'PUT' : 'POST', body });
      router.back();
    } catch (e) {
      const err = e as ApiError;
      const fe = err.details?.fieldErrors as Record<string, string[]> | undefined;
      if (fe) setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0]])));
      else Alert.alert('Could not save the address', err.message);
    } finally { setBusy(false); }
  };

  const remove = () => Alert.alert('Delete this address?', undefined, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { try { await api(`/auth/addresses/${id}`, { method: 'DELETE' }); router.back(); } catch (e) { Alert.alert('Could not delete', (e as Error).message); } } },
  ]);

  if (!loaded) return <Loading />;
  return (
    <Screen footer={<Button title={id ? 'Save changes' : 'Save address'} onPress={save} loading={busy} />}>
      <Text v="caption" color={colors.muted}>Fields marked * are required. Our delivery partner calls this number before arriving.</Text>
      <Field label="Full name *" {...bind('fullName')} textContentType="name" autoComplete="name" />
      <Field label="Mobile number *" {...bind('phone')} keyboardType="phone-pad" maxLength={14} placeholder="10-digit mobile number"
        textContentType="telephoneNumber" autoComplete="tel" hint="For delivery and order updates on WhatsApp" />
      <Field label="Alternate mobile number" {...bind('altPhone')} keyboardType="phone-pad" maxLength={14} placeholder="Optional"
        hint="If we can't reach the number above" />
      <Field label="PIN code *" {...bind('pincode')} keyboardType="number-pad" maxLength={6} onChangeText={(t) => set('pincode')(digits(t))}
        hint={pinNote} textContentType="postalCode" autoComplete="postal-code" />
      <Field label="House / flat no., building, street *" {...bind('line1')} textContentType="streetAddressLine1" autoComplete="street-address" />
      <Field label="Area, locality" {...bind('line2')} placeholder="Optional" />
      <Field label="Landmark" {...bind('landmark')} placeholder="Optional, e.g. near City Hospital" />
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><Field label="City *" {...bind('city')} textContentType="addressCity" /></View>
        <View style={{ flex: 1 }}><Field label="State *" {...bind('state')} textContentType="addressState" /></View>
      </Row>
      <Pressable onPress={() => setF((x) => ({ ...x, isDefault: !x.isDefault }))} accessibilityRole="checkbox" accessibilityState={{ checked: f.isDefault }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingVertical: space(1) }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: f.isDefault ? colors.violet : colors.line, backgroundColor: f.isDefault ? colors.violet : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {f.isDefault ? <Text v="caption" color="#fff">✓</Text> : null}
        </View>
        <Text>Make this my default address</Text>
      </Pressable>
      {id ? <Button kind="ghost" title="Delete this address" onPress={remove} /> : null}
    </Screen>
  );
}
