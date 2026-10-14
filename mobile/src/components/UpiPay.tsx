import { useState } from 'react';
import { Alert, Image, Linking, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as ImagePicker from 'expo-image-picker';
import { api, ApiError } from '@/api/client';
import { UpiInfo } from '@/api/types';
import { appendFile } from '@/lib/files';
import { colors, radius, space } from '@/theme';
import { inr } from '@/lib/format';
import { Button, Card, Field, Row, Text } from './UI';

/**
 * Manual UPI payment: the customer pays the shop's UPI ID (QR or UPI-app button),
 * then enters the 12-digit UTR. The shop confirms it in the admin panel.
 */
export function UpiPay({ orderId, orderNumber, upi, onSubmitted }: { orderId: string; orderNumber: string; upi: UpiInfo; onSubmitted: () => void }) {
  const [utr, setUtr] = useState('');
  const [shot, setShot] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  if (upi.submitted && !editing) {
    return (
      <Card style={{ borderColor: colors.cyan }}>
        <Text v="title">Payment submitted</Text>
        <Text color={colors.muted}>We're checking your payment of {inr(upi.amount)} (UPI ref {upi.utr}). This usually takes a few hours, and you'll get a WhatsApp message once it's confirmed.</Text>
        <Pressable onPress={() => setEditing(true)}><Text v="caption" color={colors.cyan}>Entered the wrong reference number? Change it</Text></Pressable>
      </Card>
    );
  }

  const openUpiApp = async () => {
    if (!upi.uri) return;
    try { await Linking.openURL(upi.uri); }
    catch { Alert.alert('No UPI app found', 'Install Google Pay, PhonePe or Paytm, or scan the QR from another phone.'); }
  };
  const copy = async (text: string, what: string) => { await Clipboard.setStringAsync(text); Alert.alert('Copied', `${what} copied`); };
  const pickShot = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!r.canceled) setShot(r.assets[0]);
  };
  const submit = async () => {
    const clean = utr.replace(/\s/g, '');
    if (!/^\d{12}$/.test(clean)) { setErr('The UPI reference number (UTR) has 12 digits. Find it in your payment app under this payment.'); return; }
    setBusy(true); setErr(undefined);
    try {
      const form = new FormData();
      form.append('utr', clean);
      if (shot) await appendFile(form, 'screenshot', shot, 'payment.jpg');
      await api(`/orders/${orderId}/upi-payment`, { form });
      setEditing(false); onSubmitted();
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <Card style={{ borderColor: colors.warning }}>
      <Text v="title">Pay {inr(upi.amount)} by UPI</Text>
      {upi.rejectedReason ? <Text color={colors.danger}>{upi.rejectedReason}</Text> : null}

      {upi.uri ? <Button title="Pay with UPI app" onPress={openUpiApp} /> : null}
      <Text v="caption" color={colors.muted}>
        {upi.uri ? 'Opens Google Pay, PhonePe or Paytm with the amount filled in. Or scan the QR from another phone.' : `Scan this QR in any UPI app and pay exactly ${inr(upi.amount)}.`}
      </Text>

      {upi.qrImage ? (
        <View style={{ alignSelf: 'center', backgroundColor: '#fff', padding: space(3), borderRadius: radius.md }}>
          <Image source={{ uri: upi.qrImage }} style={{ width: 210, height: 210 }} resizeMode="contain" accessibilityLabel="UPI QR code" />
        </View>
      ) : null}

      {upi.upiId ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <View><Text v="caption" color={colors.muted}>UPI ID</Text><Text v="bodyStrong">{upi.upiId}</Text></View>
          <Pressable onPress={() => copy(upi.upiId!, 'UPI ID')}><Text v="caption" color={colors.cyan}>Copy</Text></Pressable>
        </Row>
      ) : null}
      <Row style={{ justifyContent: 'space-between' }}>
        <View><Text v="caption" color={colors.muted}>Amount</Text><Text v="bodyStrong">{inr(upi.amount)}</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text v="caption" color={colors.muted}>Add note</Text><Text v="bodyStrong">{orderNumber}</Text></View>
      </Row>

      <View style={{ height: 1, backgroundColor: colors.line }} />
      <Text v="bodyStrong">After paying</Text>
      <Field label="UPI reference number (UTR)" placeholder="12 digits, e.g. 412345678901" keyboardType="number-pad" maxLength={14}
        value={utr} onChangeText={setUtr} error={err}
        hint="In Google Pay: open the payment → UPI transaction ID. PhonePe: Transaction details → UTR." />
      <Pressable onPress={pickShot}>
        <Text v="caption" color={colors.cyan}>{shot ? 'Screenshot added ✓ (tap to change)' : 'Add a payment screenshot (optional)'}</Text>
      </Pressable>
      <Button title="I've paid — submit" onPress={submit} loading={busy} />
    </Card>
  );
}
