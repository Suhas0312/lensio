import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { api } from '@/api/client';
import { colors, radius, space } from '@/theme';
import { Card, Row, Text } from './UI';

interface ReviewList {
  rating: number; ratingCount: number; stars: { stars: number; count: number }[];
  items: { id: string; rating: number; title?: string | null; body: string; photos: string[]; createdAt: string; name: string }[];
}

export const Stars = ({ n, size = 14 }: { n: number; size?: number }) => (
  <Text style={{ fontSize: size, color: '#F5A524', letterSpacing: 1 }} accessibilityLabel={`${n.toFixed(1)} out of 5 stars`}>
    {'★'.repeat(Math.round(n))}<Text style={{ fontSize: size, color: colors.line }}>{'★'.repeat(5 - Math.round(n))}</Text>
  </Text>
);

/** Rating summary + verified-buyer reviews for a product page. */
export function ProductReviews({ slug }: { slug: string }) {
  const [d, setD] = useState<ReviewList | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => { api<ReviewList>(`/catalog/products/${slug}/reviews`).then(setD).catch(() => {}); }, [slug]);
  if (!d) return null;
  if (!d.ratingCount) return (
    <Card><Text v="title">Reviews</Text><Text color={colors.muted}>No reviews yet. Customers can review a frame once their order is delivered.</Text></Card>
  );
  const max = Math.max(...d.stars.map((s) => s.count), 1);
  return (
    <Card>
      <Text v="title">Reviews</Text>
      <Row style={{ alignItems: 'center', gap: space(5) }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: colors.text }}>{d.rating.toFixed(1)}</Text>
          <Stars n={d.rating} /><Text v="caption" color={colors.muted}>{d.ratingCount} review{d.ratingCount === 1 ? '' : 's'}</Text>
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          {d.stars.map((s) => (
            <Row key={s.stars} style={{ gap: space(2) }}>
              <Text v="caption" color={colors.muted} style={{ width: 22 }}>{s.stars}★</Text>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
                <View style={{ width: `${(s.count / max) * 100}%`, height: '100%', backgroundColor: '#F5A524' }} />
              </View>
              <Text v="caption" color={colors.faint} style={{ width: 24, textAlign: 'right' }}>{s.count}</Text>
            </Row>
          ))}
        </View>
      </Row>
      {(all ? d.items : d.items.slice(0, 3)).map((r) => (
        <View key={r.id} style={{ gap: space(1), paddingTop: space(3), borderTopWidth: 1, borderColor: colors.line }}>
          <Row style={{ justifyContent: 'space-between' }}><Stars n={r.rating} /><Text v="caption" color={colors.faint}>{new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</Text></Row>
          {r.title ? <Text v="bodyStrong">{r.title}</Text> : null}
          <Text color={colors.muted}>{r.body}</Text>
          {r.photos.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
              {r.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 72, height: 72, borderRadius: radius.sm }} />)}
            </ScrollView>
          ) : null}
          <Text v="caption" color={colors.faint}>{r.name} · ✓ Verified buyer</Text>
        </View>
      ))}
      {d.items.length > 3 && !all ? <Pressable onPress={() => setAll(true)}><Text v="caption" color={colors.cyan}>Show all reviews</Text></Pressable> : null}
    </Card>
  );
}
