import { Platform } from 'react-native';

/** Adds a picked photo to a multipart form on both phones (file URI) and browsers (Blob). */
export async function appendFile(form: FormData, field: string, asset: { uri: string; fileName?: string | null; mimeType?: string | null }, fallbackName: string) {
  const name = asset.fileName ?? fallbackName;
  const type = asset.mimeType ?? 'image/jpeg';
  if (Platform.OS === 'web') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, new File([blob], name, { type: blob.type || type }));
  } else {
    form.append(field, { uri: asset.uri, name, type } as unknown as Blob);
  }
}
