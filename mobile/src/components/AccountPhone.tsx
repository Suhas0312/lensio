import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Card, Field, Row, Text } from '@/components/UI';
import { colors, space } from '@/theme';

const clean = (t: string) => t.replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '');

/**
 * The customer's mobile number (required: the delivery agent calls it, and order updates go to it on WhatsApp).
 * Verified with a WhatsApp/SMS code when the shop has codes set up, like Lenskart.
 */
export function AccountPhone() {
  const { user, setUser } = useAuth();
  const [editing, setEditing] = useState(!user?.phone);
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [via, setVia] = useState<string>('WhatsApp');
  const [codes, setCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();

  useEffect(() => { api<{ auth?: { phoneOtp?: boolean } }>('/config').then((c) => setCodes(!!c.auth?.phoneOtp)).catch(() => {}); }, []);
  useEffect(() => { if (!user?.phone) setEditing(true); }, [user?.phone]);
  if (!user) return null;

  const valid = /^[6-9]\d{9}$/.test(clean(phone));
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(undefined); try { await fn(); } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); } };

  const save = () => run(async () => {
    const p = clean(phone);
    if (codes) {
      const r = await api<{ channel: string }>('/auth/phone/send', { body: { phone: p } });
      setVia(r.channel === 'sms' ? 'SMS' : 'WhatsApp'); setSentTo(p); setCode('');
    } else {
      setUser(await api('/auth/me', { method: 'PATCH', body: { phone: p } })); setEditing(false);
    }
  });
  const verify = () => run(async () => {
    setUser(await api('/auth/phone/verify', { body: { phone: sentTo, code } }));
    setSentTo(null); setEditing(false);
  });

  return (
    <Card>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="bodyStrong">Mobile number *</Text>
        {!editing ? <Pressable onPress={() => { setEditing(true); setSentTo(null); }}><Text v="caption" color={colors.cyan}>Change</Text></Pressable> : null}
      </Row>
      {!editing && user.phone ? (
        <Row>
          <Text>+91 {user.phone}</Text>
          {user.phoneVerified ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="checkmark-circle" size={16} color={colors.success} /><Text v="caption" color={colors.success}>Verified</Text></View>
          ) : codes ? <Pressable onPress={() => { setPhone(user.phone!); setEditing(true); }}><Text v="caption" color={colors.warning}>Verify now</Text></Pressable> : null}
        </Row>
      ) : null}
      {editing && !sentTo ? (
        <>
          {!user.phone ? <Text v="caption" color={colors.warning}>Add your mobile number. Our delivery partner calls it, and we send order updates on WhatsApp.</Text> : null}
          <Field label="10-digit mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" maxLength={14}
            textContentType="telephoneNumber" autoComplete="tel" error={err} />
          <Button title={codes ? 'Send code on WhatsApp' : 'Save number'} onPress={save} loading={busy} disabled={!valid} />
          {user.phone ? <Button kind="ghost" title="Cancel" onPress={() => { setEditing(false); setPhone(user.phone ?? ''); setErr(undefined); }} /> : null}
        </>
      ) : null}
      {editing && sentTo ? (
        <>
          <Text v="caption" color={colors.muted}>We sent a 6-digit code on {via} to +91 {sentTo}.</Text>
          <Field label="6-digit code" value={code} onChangeText={(t) => setCode(t.replace(/\D/g, ''))} keyboardType="number-pad" maxLength={6}
            textContentType="oneTimeCode" autoComplete="sms-otp" error={err} />
          <Button title="Verify" onPress={verify} loading={busy} disabled={code.length !== 6} />
          <Pressable onPress={() => setSentTo(null)} style={{ alignSelf: 'center', padding: space(2) }}><Text v="caption" color={colors.cyan}>Change number or resend</Text></Pressable>
        </>
      ) : null}
    </Card>
  );
}
