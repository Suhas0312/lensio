import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useLayout } from '@/lib/layout';
import { api, cachedApi, qs } from '@/api/client';
import { CompareBar } from '@/components/CompareBar';
import { QuickView } from '@/components/QuickView';
import { ProductRow } from '@/components/ProductRow';
import { DesktopNav } from '@/components/Discovery';

import { Product } from '@/api/types';
import { ProductCard } from '@/components/ProductCard';
import { Button, Chip, Empty, Field, Row, Text } from '@/components/UI';
import { VoiceButton } from '@/components/VoiceButton';
import { ChatFab } from '@/components/ChatFab';
import { parseVoiceQuery } from '@/lib/voiceQuery';
import { inr } from '@/lib/format';
import { colors, radius, space } from '@/theme';
import { titleCase } from '@/lib/format';

const SHAPES = ['RECTANGLE', 'ROUND', 'CAT_EYE', 'AVIATOR', 'WAYFARER', 'SQUARE', 'OVAL', 'GEOMETRIC'];
const SIZES = ['SMALL', 'MEDIUM', 'WIDE'];
const FOR = [['MEN', 'Men'], ['WOMEN', 'Women'], ['KIDS', 'Kids']];
const MATERIALS = [['ACETATE', 'Acetate'], ['METAL', 'Metal'], ['TITANIUM', 'Titanium'], ['TR90', 'TR90 (flexible)']];
/** Price ranges in paise: [label, min, max] */
const PRICES: [string, number | undefined, number | undefined][] = [['Under ₹1,000', undefined, 99999], ['₹1,000–2,000', 100000, 200000], ['₹2,000–3,000', 200000, 300000], ['Above ₹3,000', 300000, undefined]];
const SORTS = [['popular', 'Popular'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['new', 'New']];

export default function Shop() {
  const { cardW, cols, pad } = useLayout();
  const listCols = cols >= 4 ? 2 : 1;   // list view: two rows side by side on wide screens
  const params = useLocalSearchParams<{ shape?: string; size?: string; voice?: string; rx?: string; sort?: string; gender?: string; kind?: string; material?: string; color?: string; brand?: string; q?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [quick, setQuick] = useState<Product | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [shape, setShape] = useState<string | undefined>(params.shape);
  const [size, setSize] = useState<string | undefined>(params.size);
  const [kind, setKind] = useState<'all' | 'eyeglasses' | 'sunglasses'>(params.kind === 'sunglasses' || params.kind === 'eyeglasses' ? params.kind : 'all');
  const [sort, setSort] = useState(params.sort ?? 'popular');
  const [gender, setGender] = useState<string | undefined>(params.gender);
  const [material, setMaterial] = useState<string | undefined>(params.material);
  const [color, setColor] = useState<string | undefined>(params.color);
  const [brand, setBrand] = useState<string | undefined>(params.brand);
  const [facets, setFacets] = useState<{ brands: { name: string; count: number }[]; colours: { name: string; hex: string; count: number }[] }>({ brands: [], colours: [] });
  // Tolerates a missing or older answer (e.g. while the server is updating) instead of crashing the shop.
  useEffect(() => {
    const f = (x: Partial<typeof facets> | null) => setFacets({ brands: Array.isArray(x?.brands) ? x!.brands : [], colours: Array.isArray(x?.colours) ? x!.colours : [] });
    cachedApi<typeof facets>('/catalog/facets', f).then(f).catch(() => {});
  }, []);
  // Links from Home (collections, shapes, banners) open the Shop already filtered.
  useEffect(() => {
    if (params.shape) setShape(params.shape); if (params.gender) setGender(params.gender); if (params.material) setMaterial(params.material);
    if (params.kind === 'sunglasses' || params.kind === 'eyeglasses') setKind(params.kind); if (params.sort) setSort(params.sort);
    if (params.color) setColor(params.color); if (params.brand) setBrand(params.brand);
  }, [params.shape, params.gender, params.material, params.kind, params.sort, params.color, params.brand]);
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
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (params.shape) setShape(params.shape); if (params.size) setSize(params.size); }, [params.shape, params.size]);
  useEffect(() => { if (params.voice) applyVoice(String(params.voice)); }, [params.voice]); // voice search from Home
  useEffect(() => { if (params.sort) setSort(String(params.sort)); }, [params.sort]);
  useEffect(() => { setMaxLensWidth(params.rx === 'high' ? 52 : undefined); }, [params.rx]);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const path = '/catalog/products' + qs({ q, shape, size, sort, gender, material, color, brand, minPrice, maxPrice, page: p, sunglasses: kind === 'all' ? undefined : String(kind === 'sunglasses'), maxLensWidth });
      type R = { items: Product[]; pages: number; total?: number };
      // Page 1 shows the saved copy instantly (and works offline); later pages load normally.
      const r = p === 1
        ? await cachedApi<R>(path, (saved) => { setItems(saved.items); setPages(saved.pages); setPage(1); setLoading(false); })
        : await api<R>(path);
      setItems((prev) => (p === 1 ? r.items : [...prev, ...r.items])); setPages(r.pages); setPage(p); setTotal(r.total ?? null);
    } catch { /* offline with nothing saved yet: the empty state explains */ } finally { setLoading(false); }
  }, [q, shape, size, sort, kind, gender, material, color, brand, minPrice, maxPrice, maxLensWidth]);

  useEffect(() => { const t = setTimeout(() => load(1), 250); return () => clearTimeout(t); }, [load]);

  const header = (
    <View style={{ gap: space(3), paddingBottom: space(4) }}>
      <DesktopNav />
      <Row style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}><Field label="Search" placeholder="Frame name, brand or code, or tap 🎤 and speak" value={q} onChangeText={(t) => { setQ(t); setSuggestOpen(true); }} returnKeyType="search"
          onSubmitEditing={() => setSuggestOpen(false)} onBlur={() => setTimeout(() => setSuggestOpen(false), 200)} /></View>
        <View style={{ paddingBottom: 3 }}><VoiceButton onPartial={setHeard} onFinal={applyVoice} /></View>
      </Row>
      {suggestOpen && q.trim().length >= 2 && items.length ? (
        <View style={{ backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, overflow: 'hidden' }} accessibilityRole="list" accessibilityLabel="Suggestions">
          {items.slice(0, 5).map((p) => (
            <Pressable key={p.id} onPress={() => { setSuggestOpen(false); router.push(`/product/${p.slug}`); }} accessibilityRole="button" accessibilityLabel={`${p.name}, ${inr(p.basePrice)}`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), padding: space(2.5), backgroundColor: pressed ? colors.raised : 'transparent' })}>
              <View style={{ width: 56, height: 40, borderRadius: 8, backgroundColor: '#F4F5FB', overflow: 'hidden' }}>{p.images?.[0] ? <Image source={{ uri: p.images[0].url }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> : null}</View>
              <Text style={{ flex: 1 }} numberOfLines={1}>{p.name}</Text>
              <Text v="bodyStrong">{inr(p.basePrice)}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setSuggestOpen(false)} style={{ padding: space(2.5) }}><Text v="caption" color={colors.cyan}>See all {total ?? items.length} results ↓</Text></Pressable>
        </View>
      ) : null}
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
        {FOR.map(([k, l]) => <Chip key={k} label={l} selected={gender === k} onPress={() => setGender(gender === k ? undefined : k)} />)}
        {MATERIALS.map(([k, l]) => <Chip key={k} label={l} selected={material === k} onPress={() => setMaterial(material === k ? undefined : k)} />)}
      </ScrollView>
      {facets.colours.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2), alignItems: 'center' }}>
          {facets.colours.map((c) => (
            <Pressable key={c.name} onPress={() => setColor(color === c.name ? undefined : c.name)} accessibilityRole="button" accessibilityState={{ selected: color === c.name }} accessibilityLabel={`${c.name} frames`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space(3), paddingVertical: space(2), borderRadius: radius.pill, borderWidth: 1, borderColor: color === c.name ? colors.violet : colors.line, backgroundColor: color === c.name ? 'rgba(123,97,255,0.2)' : 'transparent' }}>
              <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c.hex, borderWidth: 1, borderColor: colors.line }} />
              <Text v="caption">{c.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
      {facets.brands.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
          {facets.brands.map((b) => <Chip key={b.name} label={b.name} selected={brand === b.name} onPress={() => setBrand(brand === b.name ? undefined : b.name)} />)}
        </ScrollView>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {PRICES.map(([l, mn, mx]) => {
          const on = minPrice === mn && maxPrice === mx;
          return <Chip key={l} label={l} selected={on} onPress={() => { setMinPrice(on ? undefined : mn); setMaxPrice(on ? undefined : mx); }} />;
        })}
      </ScrollView>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text v="caption" color={colors.muted}>{total != null ? `${total} frames` : ' '}</Text>
        <Row style={{ gap: space(1) }}>
          {(['grid', 'list'] as const).map((l) => (
            <Pressable key={l} onPress={() => setLayout(l)} accessibilityRole="button" accessibilityState={{ selected: layout === l }} accessibilityLabel={l === 'grid' ? 'Grid view' : 'List view'}
              style={{ padding: space(2), borderRadius: radius.sm, backgroundColor: layout === l ? 'rgba(123,97,255,0.25)' : 'transparent' }}>
              <Ionicons name={l === 'grid' ? 'grid-outline' : 'list-outline'} size={20} color={layout === l ? colors.violet : colors.muted} />
            </Pressable>
          ))}
        </Row>
      </Row>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space(2) }}>
        {SORTS.map(([k, l]) => <Chip key={k} label={l} selected={sort === k} onPress={() => setSort(k)} />)}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.night }}>
      <FlatList
        key={layout === 'list' ? `list-${listCols}` : `grid-${cols}`} data={items} numColumns={layout === 'list' ? listCols : cols} keyExtractor={(p) => p.id}
        columnWrapperStyle={(layout === 'list' ? listCols : cols) > 1 ? { gap: space(3) } : undefined} contentContainerStyle={{ padding: pad, gap: space(5) }}
        ListHeaderComponent={header}
        renderItem={({ item }) => layout === 'list'
          ? <View style={{ flex: 1 / listCols }}><ProductRow p={item} onQuickView={setQuick} /></View>
          : <ProductCard p={item} width={cardW} onQuickView={setQuick} />}
        onEndReached={() => { if (!loading && page < pages) load(page + 1); }} onEndReachedThreshold={0.4}
        ListEmptyComponent={loading ? <ActivityIndicator color={colors.violet} /> :
          <Empty title="No frames match" body="Clear a filter or search for a different style." />}
        ListFooterComponent={
          <View style={{ alignItems: 'center', gap: space(3), paddingBottom: 90 }}>
            {loading && items.length ? <ActivityIndicator color={colors.violet} /> : null}
            {items.length && total ? <Text v="caption" color={colors.muted}>Showing {items.length} of {total} frames</Text> : null}
            {!loading && page < pages ? <Button kind="secondary" title="Show more frames" onPress={() => load(page + 1)} /> : null}
          </View>
        }
      />
      <ChatFab />
      <CompareBar />
      <QuickView p={quick} onClose={() => setQuick(null)} />
    </View>
  );
}
