import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { colors } from '@/theme';

/**
 * Microphone button. Works on Android, iPhone and in browsers (Chrome, Safari, Edge).
 * onPartial fires while speaking; onFinal once the sentence is done.
 */
export function VoiceButton({ onFinal, onPartial, size = 22 }: { onFinal: (text: string) => void; onPartial?: (text: string) => void; size?: number }) {
  const [listening, setListening] = useState(false);
  const pulse = useRef(new Animated.Value(1)).current;
  const lastText = useRef('');

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    if (lastText.current) { onFinal(lastText.current); lastText.current = ''; }
  });
  useSpeechRecognitionEvent('result', (e) => {
    const t = e.results[0]?.transcript ?? '';
    lastText.current = t;
    onPartial?.(t);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false); lastText.current = '';
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    const msg = e.error === 'not-allowed' ? 'Allow microphone access to search with your voice.'
      : e.error === 'network' ? 'Voice search needs an internet connection.'
      : e.error === 'service-not-allowed' ? 'Voice search is not available on this device. Type your search instead.'
      : 'Could not hear that. Try again.';
    Alert.alert('Voice search', msg);
  });

  useEffect(() => {
    if (!listening) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.25, duration: 500, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  const toggle = async () => {
    if (listening) { ExpoSpeechRecognitionModule.stop(); return; }
    if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
      Alert.alert('Voice search', 'Voice search is not available in this browser. Try Chrome or Safari, or type your search.');
      return;
    }
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) { Alert.alert('Voice search', 'Allow microphone access to search with your voice.'); return; }
    ExpoSpeechRecognitionModule.start({ lang: 'en-IN', interimResults: true, continuous: false, addsPunctuation: false });
  };

  return (
    <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={listening ? 'Stop listening' : 'Search by voice'} hitSlop={8}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: listening ? colors.violet : colors.surface, borderWidth: 1, borderColor: listening ? colors.violet : colors.line }}>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={size} color={colors.text} />
      </Animated.View>
    </Pressable>
  );
}
