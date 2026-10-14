import { Alert, AlertButton, Platform } from 'react-native';

/**
 * react-native-web's Alert.alert does nothing, so on the web we map it to the browser's
 * alert/confirm. With two or more buttons, OK runs the first non-cancel button.
 */
if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const actions = (buttons ?? []).filter((b) => b.style !== 'cancel');
    if (!buttons || buttons.length <= 1) { window.alert(text); buttons?.[0]?.onPress?.(); return; }
    if (window.confirm(text)) actions[0]?.onPress?.();
    else buttons.find((b) => b.style === 'cancel')?.onPress?.();
  };
}
export {};
