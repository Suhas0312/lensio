import { useState } from 'react';
import { Alert, Image, Pressable, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { useLensFlow } from '@/store/lensFlow';
import { useAuth } from '@/store/auth';
import { appendFile } from '@/lib/files';
import { Button, Card, Chip, Field, Row, Screen, Text } from '@/components/UI';
import { colors, radius, space } from '@/theme';

type Eye = { sph: string; cyl: string; axis: string; add: string; near: string };
const blankEye: Eye = { sph: '', cyl: '', axis: '', add: '', near: '' };
/** ADD from the near-vision row, shown as a preview: ADD = near SPH − distance SPH. */
const derivedAdd = (e: Eye) => {
  const sph = n(e.sph), near = n(e.near);
  if (sph == null || near == null || Number.isNaN(sph) || Number.isNaN(near)) return null;
  const a = Math.round((near - sph) * 100) / 100;
  return a > 0 ? a : null;
};
const fmt = (v: number) => (v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2));
const n = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** Adds a prescription. Opened from the lens flow, the account tab, or an order ("send later"). */
export default function NewPrescription() {
  const { lensType, orderId, itemId } = useLocalSearchParams<{ lensType?: string; orderId?: string; itemId?: string }>();
  const setFlow = useLensFlow((s) => s.set);
  const [mode, setMode] = useState<'upload' | 'manual'>('upload');
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [od, setOd] = useState<Eye>(blankEye);
  const [os, setOs] = useState<Eye>(blankEye);
  const [pd, setPd] = useState('');
  const [label, setLabel] = useState('My prescription');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ high: boolean; add: boolean } | null>(null);
  const user = useAuth((st) => st.user);
  const needsAdd = lensType === 'BIFOCAL' || lensType === 'PROGRESSIVE';
  const fromFlow = !!lensType || !!(orderId && itemId);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/account'));

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Permission needed', `Allow ${camera ? 'camera' : 'photo'} access in Settings to add your prescription.`);
    const r = await (camera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync)({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8 });
    if (!r.canceled) setImage(r.assets[0]);
  };

  const done = async (id: string, warnings: { message: string }[] = [], info: { high: boolean; add: boolean } = { high: false, add: false }) => {
    if (orderId && itemId) await api(`/orders/${orderId}/items/${itemId}/prescription`, { body: { prescriptionId: id } });
    else setFlow({ prescriptionId: id, sendRxLater: false });
    if (warnings.length) Alert.alert('Saved: please check', warnings.map((w) => w.message).join('\n\n'));
    if (fromFlow) return leave();
    setSaved(info); // opened from Home/Account: offer frame suggestions for this prescription
  };

  const upload = async () => {
    if (!image) return;
    setBusy(true);
    try {
      const form = new FormData();
      await appendFile(form, 'file', image, 'prescription.jpg');
      form.append('label', label);
      const r = await api<{ prescription: { id: string } }>('/prescriptions/upload', { form });
      await done(r.prescription.id, [], { high: false, add: false });
    } catch (e) { Alert.alert('Upload failed', (e as ApiError).message); } finally { setBusy(false); }
  };

  const save = async () => {
    setBusy(true); setErrors({});
    try {
      const body = {
        label, lensType: lensType ?? null, pdTotal: n(pd),
        od: { sph: n(od.sph), cyl: n(od.cyl), axis: n(od.axis), add: n(od.add), near: n(od.near) },
        os: { sph: n(os.sph), cyl: n(os.cyl), axis: n(os.axis), add: n(os.add), near: n(os.near) },
      };
      const r = await api<{ prescription: { id: string; isHighPower: boolean; odAdd?: string | null; osAdd?: string | null }; warnings: { message: string }[] }>('/prescriptions/manual', { body });
      await done(r.prescription.id, r.warnings, { high: r.prescription.isHighPower, add: !!(r.prescription.odAdd || r.prescription.osAdd) });
    } catch (e) {
      const err = e as ApiError;
      const list: { field: string; message: string }[] = err.details?.errors ?? [];
      if (list.length) setErrors(Object.fromEntries(list.map((x) => [x.field, x.message])));
      else Alert.alert('Could not save', err.message);
    } finally { setBusy(false); }
  };

  const eyeFields = (key: 'od' | 'os', v: Eye, set: (e: Eye) => void) => {
    const auto = !v.add.trim() ? derivedAdd(v) : null;
    const cols: [keyof Eye, string, string][] = [['sph', 'SPH', '0.00'], ['cyl', 'CYL', '0.00'], ['axis', 'AXIS', '0–180'], ['add', needsAdd ? 'ADD *' : 'ADD', auto != null ? fmt(auto) : '+0.00']];
    return (
      <Card>
        <Text v="title">{key === 'od' ? 'Right eye (OD / R)' : 'Left eye (OS / L)'}</Text>
        <Text v="caption" color={colors.muted}>Distance vision (D.V.)</Text>
        <Row style={{ alignItems: 'flex-start', gap: space(2) }}>
          {cols.map(([f, label, ph]) => (
            <View key={f} style={{ flex: 1 }}>
              <Field label={label} value={v[f]} onChangeText={(t) => set({ ...v, [f]: t })}
                keyboardType="numbers-and-punctuation" placeholder={ph} />
            </View>
          ))}
        </Row>
        <Row style={{ alignItems: 'flex-end', gap: space(2) }}>
          <View style={{ flex: 1 }}>
            <Field label="Near vision (N.V.) SPH" value={v.near} onChangeText={(t) => set({ ...v, near: t })}
              keyboardType="numbers-and-punctuation" placeholder="only if your prescription has a N.V. row" />
          </View>
        </Row>
        {auto != null ? <Text v="caption" color={colors.success}>ADD {fmt(auto)} worked out from your near-vision row.</Text> : null}
        {Object.entries(errors).filter(([k]) => k.startsWith(key)).map(([k, m]) => <Text key={k} v="caption" color={colors.danger}>{m}</Text>)}
      </Card>
    );
  };

  if (!user) {
    return (
      <Screen>
        <Card>
          <Text v="title">Sign in to add your prescription</Text>
          <Text color={colors.muted}>Your prescription is saved privately to your account, so you can use it for any order.</Text>
          <Button title="Sign in" onPress={() => router.push('/(auth)/login')} />
        </Card>
      </Screen>
    );
  }

  if (saved) {
    const rx = saved.high ? 'high' : saved.add ? 'progressive' : undefined;
    return (
      <Screen>
        <Card style={{ borderColor: colors.success }}>
          <Text v="title">Prescription saved ✓</Text>
          <Text color={colors.muted}>
            {saved.high ? 'You have a higher power. Smaller frames keep your lenses thinner and lighter; we\'ve picked those for you.'
              : saved.add ? 'Your prescription includes ADD for reading, so bifocal or progressive lenses may suit you. Deeper frames work best.'
              : 'You can now choose frames and lenses. Our optician checks every prescription before your lenses are made.'}
          </Text>
          <Button title="See frames for my prescription" onPress={() => router.replace({ pathname: '/(tabs)/shop', params: rx ? { rx } : {} })} />
          <Button kind="secondary" title="Try frames on my face" onPress={() => router.replace('/(tabs)/tryon')} />
          <Button kind="ghost" title="Done" onPress={leave} />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen footer={mode === 'upload'
      ? <Button title="Upload prescription" onPress={upload} loading={busy} disabled={!image} />
      : <Button title="Save prescription" onPress={save} loading={busy} />}>
      <Row style={{ gap: space(2) }}>
        <Chip label="Upload a photo" selected={mode === 'upload'} onPress={() => setMode('upload')} />
        <Chip label="Enter manually" selected={mode === 'manual'} onPress={() => setMode('manual')} />
      </Row>
      <Field label="Name this prescription" value={label} onChangeText={setLabel} />

      {mode === 'upload' ? (
        <>
          <Pressable onPress={() => pick(true)} style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, borderRadius: radius.md, aspectRatio: 1.4, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {image ? <Image source={{ uri: image.uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
              : <View style={{ alignItems: 'center', gap: space(2) }}><Text v="title">Take a photo</Text><Text v="caption" color={colors.muted}>Lay it flat in good light, all values readable</Text></View>}
          </Pressable>
          <Button kind="secondary" title="Choose from gallery" onPress={() => pick(false)} />
          <Text v="caption" color={colors.muted}>Our optician reads the values and confirms them with you on WhatsApp if anything is unclear.</Text>
        </>
      ) : (
        <>
          <Text v="caption" color={colors.muted}>Copy the values exactly, including + or − signs. Leave CYL, AXIS and ADD empty if your prescription doesn't have them. If it has a near-vision (N.V.) row instead of ADD, enter that and we'll work out ADD.</Text>
          {eyeFields('od', od, setOd)}
          {eyeFields('os', os, setOs)}
          <Field label="Pupillary distance (PD), mm" value={pd} onChangeText={setPd} keyboardType="decimal-pad" placeholder="e.g. 63"
            error={errors.pdTotal} hint="Printed on most prescriptions. Ask your optician if it's missing." />
          {errors.lensType ? <Text color={colors.danger}>{errors.lensType}</Text> : null}
        </>
      )}
      <Text v="caption" color={colors.faint}>Stored privately. Only you and our optician can see it.</Text>
    </Screen>
  );
}
