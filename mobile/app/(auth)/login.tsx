import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { useAuth } from '@/store/auth';
import { Button, Chip, Field, Row, Text } from '@/components/UI';
import { Logo } from '@/components/Logo';
import { colors, space } from '@/theme';
import { webColumn } from '@/lib/layout';

type Channel = 'email' | 'phone';
type Mode = 'signin' | 'signup' | 'code';

/**
 * Sign-in screen. Two ways in:
 * - Email: password, or a passwordless 6-digit email code (also resets the password).
 * - Mobile number: 6-digit code on WhatsApp (SMS as backup), shown once the server has either set up.
 */
export default function Login() {
  const signIn = useAuth((s) => s.signIn);
  const [channel, setChannel] = useState<Channel>('email');
  const [phoneOtpAvailable, setPhoneOtpAvailable] = useState(false);
  const [smsAvailable, setSmsAvailable] = useState(false);
  const [sentVia, setSentVia] = useState<'whatsapp' | 'sms'>('whatsapp');

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [codeSent, setCodeSent] = useState(false);

  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api<{ auth?: { phoneOtp?: boolean; otpWhatsApp?: boolean; otpSms?: boolean } }>('/config').then((c) => {
      setPhoneOtpAvailable(!!c.auth?.phoneOtp); setSmsAvailable(!!c.auth?.otpSms);
      if (c.auth?.otpWhatsApp) setChannel('phone');   // like Lenskart: mobile number first when WhatsApp codes are on
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!cooldown) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const switchChannel = (c: Channel) => { setChannel(c); setErr(undefined); setCodeSent(false); setPhoneCodeSent(false); setCode(''); setPhoneCode(''); };
  const switchMode = (m: Mode) => { setMode(m); setErr(undefined); setCodeSent(false); setCode(''); };
  const done = async (r: { token: string; user: any }) => {
    await signIn(r.token, r.user);
    router.canGoBack() ? router.back() : router.replace('/(tabs)');
  };
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(undefined);
    try { await fn(); } catch (e) {
      const ae = e as ApiError;
      // New here: take them to Create account with their email filled in (name + mobile are needed for delivery).
      if (ae.code === 'NO_ACCOUNT') { switchMode('signup'); setErr('No Lensio account with this email yet. Add your name and mobile number to create one.'); }
      else setErr(ae.message);
    } finally { setBusy(false); }
  };
  const emailOk = /\S+@\S+\.\S+/.test(email.trim());
  const phoneOk = phone.replace(/\D/g, '').length === 10;

  const signin = () => run(async () => done(await api('/auth/login', { body: { email, password } })));
  const signup = () => run(async () => done(await api('/auth/register', { body: { name, email, password, phone } })));
  const sendCode = () => run(async () => {
    await api('/auth/email-code/send', { body: { email, purpose: mode === 'signup' ? 'signup' : 'signin' } });
    setCodeSent(true); setCooldown(30); setCode('');
  });
  const verifyCode = () => run(async () => done(await api('/auth/email-code/verify', {
    body: { email, code, ...(newPassword ? { newPassword } : {}) },
  })));

  const sendPhoneCode = (via: 'whatsapp' | 'sms' = 'whatsapp') => run(async () => {
    const r = await api<{ channel?: 'whatsapp' | 'sms' }>('/auth/otp/send', { body: { phone, channel: via } });
    setSentVia(r.channel ?? via); setPhoneCodeSent(true); setCooldown(30);
  });
  const verifyPhoneCode = () => run(async () => done(await api('/auth/otp/verify', { body: { phone, code: phoneCode } })));

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.night }}>
      <ScrollView contentContainerStyle={[{ padding: space(6), gap: space(6), flexGrow: 1, justifyContent: 'center' }, webColumn(440)]} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}><Logo variant="lockup" height={150} /></View>

        {phoneOtpAvailable ? (
          <Row style={{ gap: space(2), justifyContent: 'center' }}>
            <Chip label="Email" selected={channel === 'email'} onPress={() => switchChannel('email')} />
            <Chip label="Mobile number" selected={channel === 'phone'} onPress={() => switchChannel('phone')} />
          </Row>
        ) : null}

        {channel === 'phone' ? (
          <View style={{ gap: space(4) }}>
            {!phoneCodeSent ? (
              <>
                <Field label="Mobile number" placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={13}
                  value={phone} onChangeText={setPhone} error={err} autoFocus textContentType="telephoneNumber" />
                <Button title="Get code on WhatsApp" onPress={() => sendPhoneCode('whatsapp')} loading={busy} disabled={!phoneOk} />
                <Text v="caption" color={colors.faint} style={{ textAlign: 'center' }}>We'll send a 6-digit code to your WhatsApp. No password needed.</Text>
              </>
            ) : (
              <>
                <Field label={`Code sent ${sentVia === 'sms' ? 'by SMS' : 'on WhatsApp'} to +91 ${phone.replace(/\D/g, '').slice(-10)}`} placeholder="6-digit code" keyboardType="number-pad" maxLength={6}
                  value={phoneCode} onChangeText={setPhoneCode} error={err} autoFocus textContentType="oneTimeCode" autoComplete="sms-otp" />
                <Button title="Verify and continue" onPress={verifyPhoneCode} loading={busy} disabled={phoneCode.length !== 6} />
                <Row style={{ justifyContent: 'space-between' }}>
                  <Pressable onPress={() => { setPhoneCodeSent(false); setPhoneCode(''); setErr(undefined); }}><Text v="caption" color={colors.cyan}>Change number</Text></Pressable>
                  <Pressable onPress={() => sendPhoneCode(sentVia)} disabled={cooldown > 0}>
                    <Text v="caption" color={cooldown ? colors.faint : colors.cyan}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</Text>
                  </Pressable>
                </Row>
                {smsAvailable && sentVia === 'whatsapp' ? (
                  <Pressable onPress={() => sendPhoneCode('sms')} disabled={cooldown > 0} style={{ alignSelf: 'center', padding: space(1) }}>
                    <Text v="caption" color={cooldown ? colors.faint : colors.cyan}>No WhatsApp? {cooldown ? `Get it by SMS in ${cooldown}s` : 'Get the code by SMS'}</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <>
            <Row style={{ gap: space(2), justifyContent: 'center' }}>
              <Chip label="Sign in" selected={mode === 'signin'} onPress={() => switchMode('signin')} />
              <Chip label="Create account" selected={mode === 'signup'} onPress={() => switchMode('signup')} />
            </Row>

            <View style={{ gap: space(4) }}>
              {mode === 'signup' ? <Field label="Your name *" value={name} onChangeText={setName} textContentType="name" autoComplete="name" /> : null}
              {mode === 'signup' ? <Field label="Mobile number *" value={phone} onChangeText={setPhone} placeholder="10-digit mobile number" keyboardType="phone-pad" maxLength={13}
                textContentType="telephoneNumber" autoComplete="tel" hint="For delivery updates on WhatsApp and the delivery agent" /> : null}

              <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address"
                autoCapitalize="none" autoCorrect={false} textContentType="emailAddress" autoComplete="email" editable={!codeSent} />

              {mode === 'signin' || mode === 'signup' ? (
                <>
                  <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
                    textContentType={mode === 'signup' ? 'newPassword' : 'password'} autoComplete={mode === 'signup' ? 'password-new' : 'password'}
                    hint={mode === 'signup' ? 'At least 8 characters' : undefined} error={err} />
                  {mode === 'signin'
                    ? <Button title="Sign in" onPress={signin} loading={busy} disabled={!emailOk || !password} />
                    : <Button title="Create account" onPress={signup} loading={busy} disabled={!emailOk || password.length < 8 || !name.trim() || !phoneOk} />}
                  <Pressable onPress={() => switchMode('code')} style={{ alignSelf: 'center', padding: space(2) }}>
                    <Text v="caption" color={colors.cyan}>{mode === 'signin' ? 'Forgot password? Email me a code' : 'Sign up with an email code instead'}</Text>
                  </Pressable>
                </>
              ) : !codeSent ? (
                <>
                  <Text v="caption" color={colors.muted}>We'll email you a 6-digit code. No password needed.</Text>
                  {err ? <Text v="caption" color={colors.danger}>{err}</Text> : null}
                  <Button title="Email me a code" onPress={sendCode} loading={busy} disabled={!emailOk} />
                  <Pressable onPress={() => switchMode('signin')} style={{ alignSelf: 'center', padding: space(2) }}>
                    <Text v="caption" color={colors.cyan}>Sign in with password instead</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text color={colors.muted}>Check your inbox for the code. It can take a minute, and may land in spam.</Text>
                  <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6}
                    textContentType="oneTimeCode" autoComplete="one-time-code" autoFocus />
                  <Field label="New password (optional)" value={newPassword} onChangeText={setNewPassword} secureTextEntry
                    textContentType="newPassword" hint="Set one now to sign in with a password next time" error={err} />
                  <Button title="Continue" onPress={verifyCode} loading={busy} disabled={code.length !== 6 || (!!newPassword && newPassword.length < 8)} />
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Pressable onPress={() => { setCodeSent(false); setCode(''); }}><Text v="caption" color={colors.cyan}>Change email</Text></Pressable>
                    <Pressable onPress={sendCode} disabled={cooldown > 0}>
                      <Text v="caption" color={cooldown ? colors.faint : colors.cyan}>{cooldown ? `Resend in ${cooldown}s` : 'Resend code'}</Text>
                    </Pressable>
                  </Row>
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
