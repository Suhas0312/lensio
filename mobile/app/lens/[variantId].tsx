import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { API_URL, api, ApiError, qs } from '@/api/client';
import { Coating, LensTypeOption, Prescription } from '@/api/types';
import { useLensFlow } from '@/store/lensFlow';
import { Button, Loading, OptionCard, Row, Screen, Text, Empty } from '@/components/UI';
import { colors, space } from '@/theme';
import { inr } from '@/lib/format';

type Step = 'type' | 'package' | 'coatings' | 'prescription' | 'review';
const STEPS: Step[] = ['type', 'package', 'coatings', 'prescription', 'review'];
const TITLES: Record<Step, string> = { type: 'What will you use them for?', package: 'Choose your lens', coatings: 'Add coatings', prescription: 'Your prescription', review: 'Review' };

/** Picture for a lens type, lens or coating (drawn by the server: thickness, zones, tints, mirrors…). */
const art = (kind: 'type' | 'lens' | 'coating', code: string) => `${API_URL}/catalog/lens-art/${kind}/${encodeURIComponent(code)}.png`;

export default function LensFlow() {
  const f = useLensFlow();
  const [types, setTypes] = useState<LensTypeOption[]>([]);
  const [coatings, setCoatings] = useState<Coating[]>([]);
  const [rxList, setRxList] = useState<Prescription[]>([]);
  const [step, setStep] = useState<Step>('type');
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    api<{ types: LensTypeOption[]; coatings: Coating[] }>('/lens/options' + qs({ sunglasses: String(f.isSunglasses) }))
      .then((r) => { setTypes(f.isSunglasses ? r.types.filter((t) => t.lensType === 'SINGLE_VISION_DISTANCE' || t.lensType === 'ZERO_POWER') : r.types); setCoatings(r.coatings); setLoadErr(null); })
      .catch((e) => setLoadErr((e as Error).message || 'Could not load lens options.'));
  }, [f.isSunglasses, retry]);
  useFocusEffect(useCallback(() => { api<Prescription[]>('/prescriptions').then(setRxList).catch(() => {}); }, []));

  if (loadErr && !types.length) return <Empty title="Could not load lens options" body={loadErr} action={<Button title="Try again" onPress={() => setRetry((n) => n + 1)} />} />;
  if (!types.length) return <Loading />;
  const needsRx = !!f.type?.requiresPrescription;
  const visibleSteps = STEPS.filter((s) => s !== 'prescription' || needsRx);
  const idx = visibleSteps.indexOf(step);
  const next = () => setStep(visibleSteps[idx + 1]);
  const back = () => (idx === 0 ? router.back() : setStep(visibleSteps[idx - 1]));

  const coatingTotal = f.coatings.reduce((s, c) => s + (coatings.find((x) => x.code === c)?.price ?? 0), 0);
  const total = f.framePrice + (f.pkg?.price ?? 0) + coatingTotal;
  const allowed = f.type?.allowedCoatings ?? [];

  const addToCart = async () => {
    setBusy(true);
    try {
      await api('/cart/items', { body: {
        variantId: f.variantId, lensPackageId: f.pkg?.id, coatingCodes: f.coatings,
        prescriptionId: needsRx ? f.prescriptionId : null, sendRxLater: needsRx && f.sendRxLater,
      } });
      f.reset(); router.replace('/cart');
    } catch (e) {
      Alert.alert('Could not add to cart', (e as ApiError).message);
    } finally { setBusy(false); }
  };

  const canContinue = step === 'type' ? !!f.type : step === 'package' ? !!f.pkg
    : step === 'prescription' ? (!!f.prescriptionId || f.sendRxLater) : true;

  return (
    <Screen footer={
      <View style={{ gap: space(3) }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Text color={colors.muted}>Frame + lenses</Text><Text v="title">{inr(total)}</Text>
        </Row>
        <Row>
          <Button kind="secondary" title="Back" onPress={back} style={{ flex: 1 }} />
          {step === 'review'
            ? <Button title="Add to cart" onPress={addToCart} loading={busy} style={{ flex: 2 }} />
            : <Button title="Continue" onPress={next} disabled={!canContinue} style={{ flex: 2 }} />}
        </Row>
      </View>
    }>
      <Text v="caption" color={colors.cyan}>Step {idx + 1} of {visibleSteps.length}</Text>
      <Text v="heading">{TITLES[step]}</Text>

      {step === 'type' && types.map((t) => (
        <OptionCard key={t.lensType} title={t.title} subtitle={t.subtitle} price={`from ${inr(t.startingPrice)}`} image={art('type', t.lensType)}
          selected={f.type?.lensType === t.lensType}
          onPress={() => f.set({ type: t, pkg: t.packages[0], coatings: f.coatings.filter((c) => t.allowedCoatings.includes(c)), prescriptionId: null, sendRxLater: false })} />
      ))}

      {step === 'package' && f.type?.packages.map((p, i) => (
        <OptionCard key={p.id} title={p.name} subtitle={`${p.description} Up to ±${Number(p.maxAbsSph)} SPH, ±${Number(p.maxAbsCyl)} CYL.`} image={art('lens', p.code)}
          price={p.price ? inr(p.price) : 'Included'} badge={i === 1 ? 'Most chosen' : undefined}
          selected={f.pkg?.id === p.id} onPress={() => f.set({ pkg: p })} />
      ))}

      {step === 'coatings' && (
        <>
          <Text color={colors.muted}>Optional. Pick any that suit how you use your glasses.</Text>
          {coatings.filter((c) => allowed.includes(c.code)).map((c) => {
            const on = f.coatings.includes(c.code);
            return <OptionCard key={c.code} title={c.name} subtitle={c.description} price={`+${inr(c.price)}`} selected={on} image={art('coating', c.code)}
              onPress={() => f.set({ coatings: on ? f.coatings.filter((x) => x !== c.code) : [...f.coatings, c.code] })} />;
          })}
        </>
      )}

      {step === 'prescription' && (
        <>
          {f.type?.requiresAdd ? <Text color={colors.warning}>{f.type.title} lenses need the ADD value from your prescription.</Text> : null}
          {rxList.map((p) => (
            <OptionCard key={p.id} title={p.label}
              subtitle={p.source === 'UPLOAD' ? 'Photo — our optician will read it' : `R ${p.odSph ?? '0'} / ${p.odCyl ?? '0'}  ·  L ${p.osSph ?? '0'} / ${p.osCyl ?? '0'}${p.isHighPower ? '  ·  high power' : ''}`}
              selected={f.prescriptionId === p.id} onPress={() => f.set({ prescriptionId: p.id, sendRxLater: false })} />
          ))}
          <Button kind="secondary" title="Add a new prescription" onPress={() => router.push({ pathname: '/prescription/new', params: { lensType: f.type?.lensType } })} />
          <OptionCard title="I'll send it after ordering" subtitle="Upload it from your order page. We start making your lenses once it arrives."
            selected={f.sendRxLater} onPress={() => f.set({ sendRxLater: true, prescriptionId: null })} />
        </>
      )}

      {step === 'review' && (
        <View style={{ gap: space(3) }}>
          {[
            [f.productName, f.framePrice],
            [f.pkg?.name ?? 'No lens', f.pkg?.price ?? 0],
            ...f.coatings.map((c) => { const x = coatings.find((y) => y.code === c); return [x?.name ?? c, x?.price ?? 0]; }),
          ].map(([l, v]) => (
            <Row key={String(l)} style={{ justifyContent: 'space-between' }}><Text>{l}</Text><Text>{inr(Number(v))}</Text></Row>
          ))}
          {needsRx ? <Text v="caption" color={colors.muted}>{f.sendRxLater ? 'Prescription: sending after ordering' : 'Prescription attached. Our optician checks every prescription before lens cutting.'}</Text> : null}
        </View>
      )}
    </Screen>
  );
}
