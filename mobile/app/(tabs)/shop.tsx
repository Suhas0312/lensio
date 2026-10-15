import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLayout } from '@/lib/layout';
import { api, cachedApi, qs } from '@/api/client';
import { CompareBar } from '@/components/CompareBar';
import { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { Chip, Empty, Field, Row, Text } from '@/components/UI';
import { VoiceButton } from '@/components/VoiceButton';
import { ChatFab } from '@/components/ChatFab';
import { parseVoiceQuery } from '@/lib/voiceQuery';
import { inr } from '@/lib/format';
import { colors, space } from '@/theme';
import { titleCase } from '@/lib/format';

const SHAPES = ['RECTANGLE', 'ROUND', 'CAT_EYE', 'AVIATOR', 'WAYFARER', 'SQUARE', 'OVAL', 'GEOMETRIC'];
const SIZES = ['SMALL', 'MEDIUM', 'WIDE'];
const SORTS = [['popular', 'Popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['new', 'New']];

export default function Shop() {
  const { cardW, cols, pad } = useLayout();
  const params = useLocalSearchParams<{ shape?: string; size?: string; voice?: string; rx?: string; sort?: string }>();
  const [q, setQ] = useState('');
  const [shape, setShape] = useState<string | undefined>(params.shape);
  const [size, setSize] = useState<string | undefined>(params.size);
  const [kind, setKind] = useState<'all' | 'eyeglasses' | 'sunglasses'>('all');
  const [sort, setSort] = useState('popular');
  const [gender, setGender] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [heard, setHeard] = useState('');
  // Suggestions after a prescription is saved: high powers look best (thinner edges) in smaller lenses.
  const rxHint = params.rx === 'high' ? 'Smaller frames (lens width up to 52 mm) keep high-power lenses thinner and lighter.'
    : params.rx === 'progressive' ? 'For progressive lenses, choose frames with a deeper lens so reading and distance zones both fit.' : null;
  const [maxLensWidth, setMaxLensWidth] = useState<number | undefined>(params.rx === 'high' ? 52 : undefined);

  /** Applies a spoken search: "women's black cat eye under 2000" → filters + text. */
  const applyVoice = (text: string) => {
    const f = parseVoiceQuery(text);
    setHeard(text);
    setQ(f.q); setShape(f.shape); setSize(f.size); setGender(f.gender);
    setMinPrice(f.minPrice); setMaxPrice(f.maxPrice);
    if (f.sunglasses !== undefined) setKind(f.sunglasses ? 'sunglasses' : 'eyeglasses');
    if (f.sort) setSort(f.sort);
  };
  const clearVoice = () => { setHeard(''); setGender(undefined); setMinPrice(undefined); setMaxPrice(undefined); };
  const [items, setItems] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (params.shape) setShape(params.shape); if (params.size) setSize(params.size); }, [params.shape, params.size]);
  useEffect(() => { if (params.voice) applyVoice(String(params.voice)); }, [params.voice]); // voice search from Home
  useEffect(() => { if (params.sort) setSort(String(params.sort)); }, [params.sort]);
  useEffect(() => { setMaxLensWidth(params.rx === 'high' ? 52 : undefined); }, [params.rx]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const path = '/catalog/products' + qs({ q, shape, size, sort, gender, minPrice, maxPrice, page: p, sunglasses: kind === 'all' ? undefined : String(kind === 'sunglasses'), maxLensWidth });
      type R = { items: Product[]; pages: number };
      // Page 1 shows the saved copy instantly (and works offline); later pages load normally.
      const r = p === 1
        ? await cachedApi<R>(path, (saved) => { setItems(saved.items); setPages(saved.pages); setPage(1); setLoading(false); })
        : await api<R>(path);
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items])); setPages(r.pages); setPage(p);
    } catch { /* offline with nothing saved yet: the empty state explains */ } finally { setLoading(false); }
  }, [q, shape, size, sort, kind, gender, minPrice, maxPrice, maxLensWidth]);

  useEffect(() => { const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  const header = (
    <View style={{ gap: space(3), paddingBottom: space(4) }}>
      <Row style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="Search" placeholder="Frame name, or tap 🎤 and speak" value={q} onChangeText={setQ} returnKeyType="search" /></View>
        <View style={{ paddingBottom: 3 }}><VoiceButton onPartial={setHeard} onFinal={applyVoice} /></View>
      </Row>
      {rxHint ? (
        <Row style={{ justifyContent: 'space-between', backgroundColor: colors.surface, borderRadius: 12, padding: space(3), borderWidth: 1, borderColor: colors.cyan }}>
          <Text v="caption" color={colors.text} style={{ flex: 1 }}>👓 Suggested for your prescription: {rxHint}</Text>
          {maxLensWidth ? <Text v="caption" color={colors.cyan} onPress={() => setMaxLensWidth(undefined)}>Show all</Text> : null}
        </Row>
      ) : null}
      {heard ? (
        <Row style={{ justifyContent: 'space-between' }}>
          <Text v="caption" color={colors.muted} style={{ flex: 1 }}>
            🎤 "{heard}"{gender ? ` · ${gender.toLowerCase()}` : ''}{maxPrice ? ` · under ${inr(maxPrice)}` : ''}{minPrice ? ` · over ${inr(minPrice)}` : ''}
          </Text>
          <Text v="caption" color={colors.cyan} onPress={clearVoice}>Clear</Text>
        </Row>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        <Chip label="All" selected={kind === 'all'} onPress={() => setKind('all')} />
        <Chip label="Eyeglasses" selected={kind === 'eyeglasses'} onPress={() => setKind('eyeglasses')} />
        <Chip label="Sunglasses" selected={kind === 'sunglasses'} onPress={() => setKind('sunglasses')} />
        {SIZES.map((s) => <Chip key={s} label={titleCase(s)} selected={size === s} onPress={() => setSize(size === s ? undefined : s)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {SHAPES.map((s) => <Chip key={s} label={titleCase(s)} selected={shape === s} onPress={() => setShape(shape === s ? undefined : s)} />)}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {SORTS.map(([k, l]) => <Chip key={k} label={l} selected={sort === k} onPress={() => setSort(k)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <FlatList
        key={`grid-${cols}`} data={items} numColumns={cols} keyExtractor={(p) => p.id}
        columnWrapperStyle={{ gap: space(3) }} contentContainerStyle={{ padding: pad, gap: space(5) }}
        ListHeaderComponent={header}
        renderItem={({ item }) => <ProductCard p={item} width={cardW} />}
        onEndReached={() => { if (!loading && page < pages) load(page + 1); }} onEndReachedThreshold={0.4}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.violet} /> :
          <Empty title="No frames match" body="Clear a filter or search for a different style." />}
        ListFooterComponent={loading && items.length ? <ActivityIndicator color={colors.violet} /> : <View style={{ height: 70 }} />}
      />
      <ChatFab />
      <CompareBar />
    </View>
  );
}
