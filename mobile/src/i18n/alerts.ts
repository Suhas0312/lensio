import { Alert, AlertButton } from 'react-native';
import { tr } from './index';

/** Pop-up messages (Alert.alert) also follow the chosen language. Loaded once from app/_layout.tsx. */
const original = Alert.alert;
Alert.alert = (title: string, message?: string, buttons?: AlertButton[], options?: object) =>
  original(tr(title), message ? tr(message) : message, buttons?.map((b) => ({ ...b, text: b.text ? tr(b.text) : b.text })), options as never);
