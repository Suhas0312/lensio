import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { api } from '@/api/client';
import { Prescription } from '@/api/types';
import { useAuth } from '@/store/auth';
import { Button, Card, Field, Row, Screen, Text } from '@/components/UI';
import { Logo } from '@/components/Logo';
import { FollowInstagram } from '@/components/FollowInstagram';
import { AccountPhone } from '@/components/AccountPhone';
import { useAppUpdate } from '@/lib/appUpdate';
import { colors, space } from '@/theme';

export default function Account() {
  const { user, signOut, setUser } = useAuth();
  // Website: show the newest released version (same as /download); the Android app shows its installed version.
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    api<{ app?: { latestVersion?: string | null } }>('/config').then((c) => setLatestVersion(c.app?.latestVersion ?? null)).catch(() => {});
  }, []);
  const [name, setName] = useState(user?.name ?? '');
  const [savingName, setSavingName] = useState(false);
  // The page can open before sign-in finishes: show the saved name as soon as the account loads.
  useEffect(() => { setName(user?.name ?? ''); }, [user?.id, user?.name]);
  const nameChanged = !!name.trim() && name.trim() !== (user?.name ?? '');
  const saveName = async () => {
    if (!nameChanged || !user) return;
    setSavingName(true);
    try { setUser(await api('/auth/me', { method: 'PATCH', body: { name: name.trim() } })); }
    catch (e) { Alert.alert('Could not save your name', (e as Error).message); }
    finally { setSavingName(false); }
  };
  const [rx, setRx] = useState<Prescription[]>([]);
  const [support, setSupport] = useState('919999999999');
  const [pwOpen, setPwOpen] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwMsg, setPwMsg] = useState<string>();
  const savePw = async () => {
    setPwMsg(undefined);
    try {
      await api('/auth/password', { body: { newPassword: newPw, ...(user?.hasPassword ? { currentPassword: curPw } : {}) } });
      setUser({ ...user!, hasPassword: true }); setPwOpen(false); setCurPw(''); setNewPw('');
    } catch (e) { setPwMsg((e as Error).message); }
  };

  const [insta, setInsta] = useState<string | null>(null);
  useEffect(() => { api<{ supportWhatsApp: string; instagramUrl?: string | null }>('/config').then((c) => { setSupport(c.supportWhatsApp); setInsta(c.instagramUrl ?? null); }).catch(() => {}); }, []);
  useFocusEffect(useCallback(() => {
    if (!user) return;
    api<Prescription[]>('/prescriptions').then(setRx).catch(() => {});
    api<any>('/auth/me').then((u) => { if (u.pointsBalance !== user.pointsBalance) setUser(u); }).catch(() => {}); // fresh points balance
  }, [user?.id]));

  const chat = () => Linking.openURL(`https://wa.me/${support}?text=${encodeURIComponent('Hi Lensio, I have a question')}`);

  return (
    <Screen>
      {user ? (
        <Card>
          <Text v="caption" color={colors.muted}>Signed in as {user.email ?? (user.phone ? `+91 ${user.phone}` : '')}</Text>
          <Field label="Your name *" value={name} onChangeText={setName} placeholder="Name for orders" textContentType="name" autoComplete="name"
            hint={!user.name ? 'Add your name once. It is used for your orders and deliveries.' : undefined}
            onSubmitEditing={saveName} returnKeyType="done" />
          {nameChanged ? <Button title="Save name" onPress={saveName} loading={savingName} /> : null}
        </Card>
      ) : null}
      {user ? (
        <AccountPhone />
      ) : null}
      {!user ? (
        <Card><Text>Sign in to save prescriptions and track orders.</Text><Button title="Sign in" onPress={() => router.push('/(auth)/login')} /></Card>
      ) : null}

      {user ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="bodyStrong">{user.hasPassword ? 'Password' : 'Set a password'}</Text>
            <Pressable onPress={() => setPwOpen(!pwOpen)}><Text v="caption" color={colors.cyan}>{pwOpen ? 'Cancel' : user.hasPassword ? 'Change' : 'Set'}</Text></Pressable>
          </Row>
          {!user.hasPassword && !pwOpen ? <Text v="caption" color={colors.muted}>Sign in faster next time, without waiting for an email code.</Text> : null}
          {pwOpen ? (
            <>
              {user.hasPassword ? <Field label="Current password" value={curPw} onChangeText={setCurPw} secureTextEntry /> : null}
              <Field label="New password" value={newPw} onChangeText={setNewPw} secureTextEntry hint="At least 8 characters" error={pwMsg} textContentType="newPassword" />
              <Button title="Save password" onPress={savePw} disabled={newPw.length < 8} />
            </>
          ) : null}
        </Card>
      ) : null}

      {user ? (
        <Card>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text v="title">Prescriptions</Text>
            <Pressable onPress={() => router.push('/prescription/new')}><Text v="caption" color={colors.cyan}>Add</Text></Pressable>
          </Row>
          {rx.length ? rx.map((p) => (
            <Row key={p.id} style={{ justifyContent: 'space-between' }}>
              <View><Text>{p.label}</Text><Text v="caption" color={colors.muted}>{p.source === 'UPLOAD' ? 'Photo' : 'Entered manually'}</Text></View>
              <Text v="caption" color={p.status === 'VERIFIED' ? colors.success : p.status === 'REJECTED' ? colors.danger : colors.warning}>
                {p.status === 'VERIFIED' ? 'Verified' : p.status === 'REJECTED' ? 'Needs a new copy' : 'Checking'}
              </Text>
            </Row>
          )) : <Text color={colors.muted}>No prescriptions saved.</Text>}
        </Card>
      ) : null}

      {user ? (
        <Card>
          <Pressable onPress={() => router.push('/rewards')} accessibilityRole="button"><Row>
            <Ionicons name="star" size={22} color="#F5A524" />
            <View style={{ flex: 1 }}><Text v="bodyStrong">Lensio Rewards</Text><Text v="caption" color={colors.muted}>{user.pointsBalance ? `${user.pointsBalance} points · worth ₹${user.pointsBalance}` : 'Earn points on every order, gift cards, reviews'}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Row></Pressable>
        </Card>
      ) : null}
      <Card>
        {[
          { icon: 'home-outline' as const, t: 'Eye test at home', s: 'Book an optometrist visit', to: '/eye-test' },
          { icon: 'location-outline' as const, t: 'Find a store', s: 'Try frames in person', to: '/stores' },
        ].map((x) => (
          <Pressable key={x.t} onPress={() => router.push(x.to)} accessibilityRole="button"><Row>
            <Ionicons name={x.icon} size={22} color={colors.cyan} />
            <View style={{ flex: 1 }}><Text v="bodyStrong">{x.t}</Text><Text v="caption" color={colors.muted}>{x.s}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Row></Pressable>
        ))}
      </Card>

      <Card>
        <Pressable onPress={chat} accessibilityRole="button"><Row>
          <Ionicons name="logo-whatsapp" size={22} color={colors.success} />
          <View style={{ flex: 1 }}><Text v="bodyStrong">Chat with us on WhatsApp</Text><Text v="caption" color={colors.muted}>Prescription questions, order help, fit advice</Text></View>
        </Row></Pressable>
      </Card>

      <FollowInstagram />

      {user ? (
        <Card>
          <Pressable onPress={() => router.push('/wishlist')} accessibilityRole="button"><Row>
            <Ionicons name="heart" size={22} color="#e11d48" />
            <View style={{ flex: 1 }}><Text v="bodyStrong">My wishlist</Text><Text v="caption" color={colors.muted}>Frames you saved with ♥</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Row></Pressable>
          <Pressable onPress={() => router.push('/compare')} accessibilityRole="button" style={{ marginTop: space(4) }}><Row>
            <Ionicons name="git-compare-outline" size={22} color={colors.violet} />
            <View style={{ flex: 1 }}><Text v="bodyStrong">Compare frames</Text><Text v="caption" color={colors.muted}>Up to 3 frames side by side</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Row></Pressable>
        </Card>
      ) : null}
      {Platform.OS === 'web' ? <GetAndroidApp /> : null}
      {Platform.OS === 'android' ? <CheckForUpdates /> : null}

      {user ? <Button kind="secondary" title="Sign out" onPress={signOut} /> : null}

      <View style={{ alignItems: 'center', gap: space(2), paddingTop: space(6) }}>
        <Logo variant="mark" height={44} />
        <Logo variant="tagline" height={14} />
        <Text v="caption" color={colors.faint}>Version {Platform.OS === 'web' ? (latestVersion ?? Constants.expoConfig?.version) : Constants.expoConfig?.version}</Text>
      </View>
    </Screen>
  );
}

/** Web app → Account: send people to the Android app (download page with the newest APK). */
function GetAndroidApp() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const android = /Android/i.test(ua), iphone = /iPhone|iPad|iPod/i.test(ua);
  if (iphone) return null; // no Android app for iPhone: the web app is their app
  return (
    <Card>
      <Pressable onPress={() => Linking.openURL(android ? '/download/lensio.apk' : '/download')} accessibilityRole="button"><Row>
        <Ionicons name="logo-android" size={24} color={colors.success} />
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">Get the Lensio Android app</Text>
          <Text v="caption" color={colors.muted}>{android ? 'Tap to download. Faster, with try-on and order updates.' : 'Open the download page, or scan its QR code with your Android phone.'}</Text>
        </View>
        <Ionicons name="download-outline" size={20} color={colors.cyan} />
      </Row></Pressable>
    </Card>
  );
}

/** Android app → Account: current version + manual "Check for updates" (the update window opens if there is one). */
function CheckForUpdates() {
  const check = useAppUpdate((s) => s.check);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { if (!(await check(true))) Alert.alert('You have the latest version', `Lensio ${Constants.expoConfig?.version ?? ''}`); }
    catch { Alert.alert('No internet connection', 'Connect to the internet and try again.'); }
    finally { setBusy(false); }
  };
  return (
    <Card>
      <Pressable onPress={run} disabled={busy} accessibilityRole="button"><Row>
        <Ionicons name="refresh-circle-outline" size={24} color={colors.cyan} />
        <View style={{ flex: 1 }}>
          <Text v="bodyStrong">{busy ? 'Checking…' : 'Check for updates'}</Text>
          <Text v="caption" color={colors.muted}>You have version {Constants.expoConfig?.version}</Text>
        </View>
      </Row></Pressable>
    </Card>
  );
}
