import { useEffect } from 'react';
import { AppState, Modal, Platform, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Text } from '@/components/UI';
import { currentVersion, openInBrowser, useAppUpdate } from '@/lib/appUpdate';
import { colors, radius, space } from '@/theme';

/** Asks Android customers to update when a newer APK is published (admin → Settings → Android app). */
export function UpdatePrompt() {
  const { info, open, phase, progress, error, check, later, start } = useAppUpdate();

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    check();
    // Check again whenever the app comes back to the foreground (e.g. the next day).
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active' && useAppUpdate.getState().phase === 'idle') check(); });
    return () => sub.remove();
  }, [check]);

  if (Platform.OS !== 'android' || !info) return null;
  const busy = phase === 'downloading' || phase === 'installing';
  const pct = Math.round(progress * 100);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => { if (!info.required && !busy) later(); }}>
      <View style={{ flex: 1, backgroundColor: 'rgba(2,3,20,0.82)', justifyContent: 'center', padding: space(6) }}>
        <View style={{ backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.lg, padding: space(6), gap: space(4) }}>
          <View style={{ alignItems: 'center', gap: space(2) }}>
            <Ionicons name="cloud-download-outline" size={40} color={colors.cyan} />
            <Text v="heading" style={{ textAlign: 'center' }}>{info.required ? 'Please update Lensio' : 'A new version is ready'}</Text>
            <Text v="caption" color={colors.muted}>Version {info.version} · you have {currentVersion()}</Text>
          </View>
          {info.notes ? <Text color={colors.muted}>{info.notes}</Text> : null}
          <Text v="caption" color={colors.muted}>
            {info.required ? 'This version of the app is no longer supported. ' : ''}
            Updating keeps your account, orders and cart. No need to uninstall.
          </Text>

          {busy ? (
            <View style={{ gap: space(2) }}>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.raised, overflow: 'hidden' }}>
                <View style={{ width: `${phase === 'installing' ? 100 : pct}%`, height: '100%', backgroundColor: colors.violet }} />
              </View>
              <Text v="caption" color={colors.muted} style={{ textAlign: 'center' }}>
                {phase === 'installing' ? 'Opening the installer… tap “Update”.' : `Downloading… ${pct}%`}
              </Text>
            </View>
          ) : null}
          {error ? <Text v="caption" color={colors.danger}>{error}</Text> : null}

          <Button title={phase === 'failed' ? 'Try again' : 'Update now'} onPress={start} loading={busy} disabled={busy} />
          {phase === 'failed' ? <Button title="Download in browser" kind="secondary" onPress={openInBrowser} /> : null}
          {!info.required && !busy ? <Button title="Later" kind="ghost" onPress={later} /> : null}
          {phase === 'idle' && !busy ? (
            <Text v="caption" color={colors.faint} style={{ textAlign: 'center' }}>
              If Android asks, allow Lensio to install updates, then tap “Update now” again.
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
