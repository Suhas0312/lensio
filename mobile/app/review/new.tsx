import { useState } from 'react';
import { Alert, Image, Pressable, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { api, ApiError } from '@/api/client';
import { appendFile } from '@/lib/files';
import { Button, Card, Field, Row, Screen, Text } from '@/components/UI';
import { colors, radius, space, type } from '@/theme';
import { FollowInstagram } from '@/components/FollowInstagram';

/** Write a review for a delivered frame. */
export default function NewReview() {
  const { productId, orderId, name } = useLocalSearchParams<{ productId: string; orderId: string; name?: string }>();
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const [done, setDone] = useState(false);

  const addPhoto = async () => {
    if (photos.length >= 4) return;
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (r.canceled) return;
    try {
      const form = new FormData(); await appendFile(form, 'file', r.assets[0], 'review.jpg');
      const up = await api<{ url: string }>('/reviews/photo', { form });
      setPhotos((p) => [...p, up.url]);
    } catch (e) { Alert.alert('Photo not added', (e as ApiError).message); }
  };
  const submit = async () => {
    setErr(undefined);
    if (!rating) return setErr('Tap the stars to give a rating.');
    if (body.trim().length < 5) return setErr('Tell other shoppers a little about the frame.');
    setBusy(true);
    try {
      await api('/reviews', { body: { productId, orderId, rating, title: title.trim() || undefined, body: body.trim(), photos } });
      setDone(true);
    } catch (e) { setErr((e as ApiError).message); } finally { setBusy(false); }
  };

  if (done) {
    return (
      <Screen>
        <Card style={{ borderColor: colors.success, alignItems: 'center' }}>
          <Text style={{ fontSize: 44, color: '#F5A524' }}>{'★'.repeat(rating)}</Text>
          <Text v="title">Thank you for your review!</Text>
          <Text color={colors.muted} style={{ textAlign: 'center' }}>It helps other shoppers find the right pair.</Text>
        </Card>
        <FollowInstagram title="Show off your new look" subtitle="Tag us, and we may feature you" />
        <Button kind="secondary" title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/orders'))} />
      </Screen>
    );
  }

  return (
    <Screen footer={<Button title="Submit review" onPress={submit} loading={busy} />}>
      <Text v="heading">{name ? `Rate ${name}` : 'Write a review'}</Text>
      <Card>
        <Text v="caption" color={colors.muted}>Your rating</Text>
        <Row style={{ gap: space(2) }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Pressable key={n} onPress={() => setRating(n)} accessibilityRole="button" accessibilityLabel={`${n} star${n > 1 ? 's' : ''}`} hitSlop={6}>
              <Text style={{ fontSize: 38, color: n <= rating ? '#F5A524' : colors.line }}>★</Text>
            </Pressable>
          ))}
        </Row>
        <Text v="caption" color={colors.faint}>{['', 'Poor', 'Could be better', 'Good', 'Very good', 'Love it!'][rating]}</Text>
      </Card>
      <Field label="Headline (optional)" value={title} onChangeText={setTitle} placeholder="e.g. Light and comfortable all day" maxLength={80} />
      <View style={{ gap: space(1.5) }}>
        <Text v="caption" color={colors.muted}>Your review</Text>
        <TextInput value={body} onChangeText={setBody} multiline maxLength={2000} placeholder="Fit, comfort, lens clarity, delivery…" placeholderTextColor={colors.faint}
          style={{ ...type.body, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, padding: space(4), minHeight: 120, textAlignVertical: 'top' }} />
      </View>
      <Row style={{ gap: space(2), flexWrap: 'wrap' }}>
        {photos.map((u) => (
          <Pressable key={u} onPress={() => setPhotos((p) => p.filter((x) => x !== u))} accessibilityLabel="Remove photo">
            <Image source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: radius.sm }} />
          </Pressable>
        ))}
        {photos.length < 4 ? (
          <Pressable onPress={addPhoto} style={{ width: 72, height: 72, borderRadius: radius.sm, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Text v="caption" color={colors.muted}>+ Photo</Text>
          </Pressable>
        ) : null}
      </Row>
      {err ? <Text color={colors.danger}>{err}</Text> : null}
    </Screen>
  );
}
