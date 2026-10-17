import { useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LANGS, useLang, useT } from '@/i18n';
import { colors, radius, space } from '@/theme';
import { Card, Row, Text } from './UI';

/** Account → Language: choose the app's language (saved on this device). */
export function LanguagePicker() {
  const t = useT();
  const { lang, set } = useLang();
  const [open, setOpen] = useState(false);
  const current = LANGS.find((l) => l.code === lang) ?? LANGS[0];
  return (
    <>
      <Card>
        <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${t('language')}: ${current.name}`}>
          <Row>
            <Ionicons name="language-outline" size={22} color={colors.cyan} />
            <View style={{ flex: 1 }}><Text v="bodyStrong">{t('language')}</Text><Text v="caption" color={colors.muted}>{current.native}{current.code !== 'en' ? ` · ${current.name}` : ''}</Text></View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Row>
        </Pressable>
      </Card>
      <Modal transparent visible={open} animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(2,3,20,0.7)', justifyContent: 'center', padding: space(5) }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.surface, borderRadius: radius.lg, maxHeight: '85%', alignSelf: 'center', width: '100%', maxWidth: 420 }}>
            <ScrollView contentContainerStyle={{ padding: space(4), gap: space(1) }}>
              <Text v="heading" style={{ marginBottom: space(2) }}>{t('language')}</Text>
              {LANGS.map((l) => (
                <Pressable key={l.code} onPress={() => { set(l.code); setOpen(false); }} accessibilityRole="radio" accessibilityState={{ checked: l.code === lang }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(3), borderRadius: radius.md, backgroundColor: l.code === lang ? 'rgba(123,97,255,0.18)' : 'transparent' }}>
                  <Text v="bodyStrong" style={{ flex: 1 }}>{l.native}</Text>
                  <Text v="caption" color={colors.muted}>{l.name}</Text>
                  {l.code === lang ? <Ionicons name="checkmark-circle" size={20} color={colors.violet} /> : null}
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
