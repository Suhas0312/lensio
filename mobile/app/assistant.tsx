import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { api, ApiError } from '@/api/client';
import { Msg, ProductCard, useAssistant } from '@/store/assistant';
import { VoiceButton } from '@/components/VoiceButton';
import { Logo } from '@/components/Logo';
import { Text } from '@/components/UI';
import { colors, gradient, radius, space, type } from '@/theme';
import { inr } from '@/lib/format';
import { webColumn } from '@/lib/layout';

const SUGGESTIONS = [
  'Suggest frames for a round face',
  'Which lens is best for computer use?',
  'What does CYL mean on my prescription?',
  'Where is my order?',
];
const id = () => Math.random().toString(36).slice(2);

export default function Assistant() {
  const { ask } = useLocalSearchParams<{ ask?: string }>();
  const { messages, add, reset } = useAssistant();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const asked = useRef(false);

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || busy) return;
    setText('');
    const mine: Msg = { id: id(), role: 'user', text: q };
    add(mine);
    setBusy(true);
    try {
      const history = [...useAssistant.getState().messages].filter((m) => m.id !== 'hello' && !m.failed).slice(-12)
        .map((m) => ({ role: m.role, text: m.text }));
      const r = await api<{ reply: string; products: ProductCard[]; handoff: boolean; supportWhatsApp: string }>('/assistant/chat', { body: { messages: history } });
      setWhatsapp(r.supportWhatsApp);
      add({ id: id(), role: 'assistant', text: r.reply, products: r.products, handoff: r.handoff });
    } catch (e) {
      add({ id: id(), role: 'assistant', text: (e as ApiError).message || 'I could not answer just now. Try again in a moment.', failed: true });
    } finally { setBusy(false); }
  };

  // Opened with a question, e.g. "Ask about this frame" on a product page.
  useEffect(() => { if (ask && !asked.current) { asked.current = true; send(String(ask)); } }, [ask]);
  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 80); }, [messages.length, busy]);

  const openWhatsApp = () => Linking.openURL(`${whatsapp ?? 'https://wa.me/'}?text=${encodeURIComponent('Hi Lensio, I have a question')}`);

  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: colors.night }}>
      <Stack.Screen options={{
        title: 'Lensio assistant',
        headerRight: () => <Pressable onPress={reset} hitSlop={10} accessibilityLabel="Start a new chat"><Ionicons name="refresh" size={20} color={colors.muted} /></Pressable>,
      }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <ScrollView ref={scroll} contentContainerStyle={[{ padding: space(4), gap: space(3) }, webColumn()]} keyboardShouldPersistTaps="handled">
          {messages.map((m) => <Bubble key={m.id} m={m} onWhatsApp={openWhatsApp} />)}
          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), paddingLeft: space(2) }}>
              <ActivityIndicator color={colors.violet} size="small" /><Text v="caption" color={colors.muted}>Thinking…</Text>
            </View>
          ) : null}
          {messages.length === 1 && !busy ? (
            <View style={{ gap: space(2), marginTop: space(2) }}>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} onPress={() => send(s)} style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2.5), backgroundColor: colors.surface }}>
                  <Text v="caption" color={colors.text}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }}>
        <View style={[{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2), padding: space(3) }, webColumn()]}>
          <TextInput value={text} onChangeText={setText} placeholder="Ask anything, or tap 🎤" placeholderTextColor={colors.faint}
            multiline maxLength={1000} onSubmitEditing={() => send(text)} blurOnSubmit returnKeyType="send"
            style={{ ...type.body, flex: 1, color: colors.text, backgroundColor: colors.night, borderRadius: 22, borderWidth: 1, borderColor: colors.line, paddingHorizontal: space(4), paddingTop: 11, paddingBottom: 11, maxHeight: 120 }} />
          <VoiceButton onPartial={setText} onFinal={(t) => send(t)} />
          <Pressable onPress={() => send(text)} disabled={!text.trim() || busy} accessibilityLabel="Send" style={{ opacity: !text.trim() || busy ? 0.4 : 1 }}>
            <LinearGradient colors={gradient as unknown as string[]} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="arrow-up" size={22} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Bubble({ m, onWhatsApp }: { m: Msg; onWhatsApp: () => void }) {
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: space(2) }}>
      {!mine && m.id === 'hello' ? <Logo variant="mark" height={34} /> : null}
      <View style={{ maxWidth: '86%', backgroundColor: mine ? colors.violet : colors.surface, borderWidth: mine ? 0 : 1, borderColor: m.failed ? colors.danger : colors.line,
        borderRadius: 18, borderBottomRightRadius: mine ? 6 : 18, borderBottomLeftRadius: mine ? 18 : 6, paddingHorizontal: space(4), paddingVertical: space(3) }}>
        <Text color={m.failed ? colors.danger : colors.text} selectable>{m.text}</Text>
      </View>
      {m.products?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }} style={{ maxWidth: '100%' }}>
          {m.products.map((p) => (
            <Pressable key={p.slug} onPress={() => router.push(`/product/${p.slug}`)} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.price)}`}
              style={{ width: 150, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' }}>
              <View style={{ height: 90, backgroundColor: '#F4F5FB' }}>
                {p.image ? <Image source={{ uri: p.image }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}
              </View>
              <View style={{ padding: space(2.5), gap: 2 }}>
                <Text v="caption" color={colors.text} numberOfLines={1}>{p.name}</Text>
                <Text v="caption" color={colors.cyan}>{inr(p.price)}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {m.handoff ? (
        <Pressable onPress={onWhatsApp} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2), borderWidth: 1, borderColor: colors.success, borderRadius: radius.pill, paddingHorizontal: space(4), paddingVertical: space(2) }}>
          <Ionicons name="logo-whatsapp" size={18} color={colors.success} /><Text v="caption" color={colors.text}>Chat with our team on WhatsApp</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
