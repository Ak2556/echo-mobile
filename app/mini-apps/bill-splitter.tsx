import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, Share } from 'react-native';
import { Minus, Plus, Users, ShareNetwork, X } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';

const TIP_PRESETS = [0, 5, 10, 15, 18, 20, 25];
type SplitMode = 'even' | 'shares' | 'exact';

interface Person {
  id: number;
  name: string;
  /** relative weight in 'shares' mode */
  shares: number;
  /** claimed pre-tax amount in 'exact' mode (string = raw input) */
  exact: string;
}

let nextId = 3;
const defaultPeople = (): Person[] => [
  { id: 1, name: 'Person 1', shares: 1, exact: '' },
  { id: 2, name: 'Person 2', shares: 1, exact: '' },
];

export default function BillSplitterScreen() {
  const { colors } = useTheme();
  const accent = colors.accent;

  const [bill, setBill] = useState('');
  const [tax, setTax] = useState('');
  const [tipPct, setTipPct] = useState(15);
  const [customTip, setCustomTip] = useState('');
  const [mode, setMode] = useState<SplitMode>('even');
  const [people, setPeople] = useState<Person[]>(defaultPeople);

  const billNum = parseFloat(bill) || 0;
  const taxNum = parseFloat(tax) || 0;
  const effectiveTip = customTip !== '' ? parseFloat(customTip) || 0 : tipPct;
  const tipAmount = billNum * (effectiveTip / 100);
  const total = billNum + taxNum + tipAmount;
  const extras = taxNum + tipAmount;
  const fmt = (n: number) => n.toFixed(2);

  const setPerson = (id: number, patch: Partial<Person>) =>
    setPeople(people.map(p => (p.id === id ? { ...p, ...patch } : p)));

  const addPerson = () => {
    nextId += 1;
    setPeople([...people, { id: nextId, name: `Person ${people.length + 1}`, shares: 1, exact: '' }]);
  };
  const removePerson = (id: number) => {
    if (people.length <= 1) return;
    setPeople(people.filter(p => p.id !== id));
  };

  // Per-person owed amounts
  const totalShares = people.reduce((s, p) => s + p.shares, 0) || 1;
  const exactSum = people.reduce((s, p) => s + (parseFloat(p.exact) || 0), 0);
  const owed = (p: Person): number => {
    if (mode === 'even') return total / people.length;
    if (mode === 'shares') return (p.shares / totalShares) * total;
    const base = parseFloat(p.exact) || 0;
    const scale = exactSum > 0 ? base / exactSum : 0;
    return base + scale * extras;
  };
  const exactGap = billNum - exactSum;

  const shareSummary = () => {
    if (total <= 0) { showToast('Enter the bill first', 'Bill Splitter'); return; }
    const lines = [
      'Bill split — Echo',
      `Subtotal $${fmt(billNum)}${taxNum > 0 ? ` · Tax $${fmt(taxNum)}` : ''} · Tip ${effectiveTip}% ($${fmt(tipAmount)})`,
      `Total $${fmt(total)}`,
      '',
      ...people.map(p => `${p.name}: $${fmt(owed(p))}`),
    ];
    Share.share({ message: lines.join('\n') }).catch(() => {});
  };

  const ShareBtn = (
    <AnimatedPressable onPress={shareSummary} scaleValue={0.88} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, padding: 10 }}>
      <ShareNetwork color={colors.text} size={18} weight="bold" />
    </AnimatedPressable>
  );

  return (
    <MiniAppShell title="Bill Splitter" subtitle="Split evenly, by shares, or exactly" headerRight={ShareBtn}>
      {/* Bill + tax */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>BILL AMOUNT</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={{ color: accent, fontSize: 42, fontWeight: '300', marginRight: 4 }}>$</Text>
          <TextInput
            value={bill}
            onChangeText={setBill}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: 48, fontWeight: '200', letterSpacing: -2 }}
          />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Tax / fees</Text>
          <TextInput
            value={tax}
            onChangeText={setTax}
            keyboardType="decimal-pad"
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1, color: colors.text, fontSize: 16, fontWeight: '600',
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
              borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
            }}
          />
        </View>
      </GlassPanel>

      {/* Tip */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TIP</Text>
          <Text style={{ color: accent, fontSize: 20, fontWeight: '700' }}>{effectiveTip}%</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIP_PRESETS.map(t => {
            const active = tipPct === t && customTip === '';
            return (
              <Pressable key={t} onPress={() => { setTipPct(t); setCustomTip(''); }}>
                <View style={{
                  paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
                  backgroundColor: active ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? 'transparent' : colors.glassBorder,
                }}>
                  <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>
                    {t === 0 ? 'None' : `${t}%`}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>Custom</Text>
          <TextInput
            value={customTip}
            onChangeText={setCustomTip}
            keyboardType="decimal-pad"
            placeholder="e.g. 22"
            placeholderTextColor={colors.textMuted}
            style={{
              flex: 1, color: colors.text, fontSize: 16, fontWeight: '600',
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
              borderWidth: 1, borderColor: customTip !== '' ? accent : colors.glassBorder,
            }}
          />
          <Text style={{ color: colors.textMuted, fontSize: 16 }}>%</Text>
        </View>
      </GlassPanel>

      {/* People + mode */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
          <Users color={colors.textMuted} size={15} weight="fill" />
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, flex: 1, marginLeft: 6 }}>
            PEOPLE · {people.length}
          </Text>
          <AnimatedPressable onPress={addPerson} scaleValue={0.88} haptic="light" style={{ backgroundColor: accent, borderRadius: 10, padding: 7 }}>
            <Plus color="#fff" size={14} weight="bold" />
          </AnimatedPressable>
        </View>

        {/* Mode toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)', borderRadius: 12, padding: 3, marginBottom: 14 }}>
          {([
            { key: 'even', label: 'Even' },
            { key: 'shares', label: 'Shares' },
            { key: 'exact', label: 'Exact' },
          ] as const).map(m => (
            <Pressable key={m.key} onPress={() => setMode(m.key)} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: mode === m.key ? accent : 'transparent' }}>
                <Text style={{ color: mode === m.key ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13 }}>{m.label}</Text>
              </View>
            </Pressable>
          ))}
        </View>

        {people.map(p => (
          <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <TextInput
              value={p.name}
              onChangeText={v => setPerson(p.id, { name: v })}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              style={{
                flex: 1, color: colors.text, fontSize: 15, fontWeight: '600',
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
                borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
              }}
            />
            {mode === 'shares' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <AnimatedPressable onPress={() => setPerson(p.id, { shares: Math.max(1, p.shares - 1) })} scaleValue={0.85} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 9, padding: 7 }}>
                  <Minus color={colors.text} size={13} weight="bold" />
                </AnimatedPressable>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', width: 20, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{p.shares}</Text>
                <AnimatedPressable onPress={() => setPerson(p.id, { shares: p.shares + 1 })} scaleValue={0.85} haptic="light" style={{ backgroundColor: accent, borderRadius: 9, padding: 7 }}>
                  <Plus color="#fff" size={13} weight="bold" />
                </AnimatedPressable>
              </View>
            )}
            {mode === 'exact' && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ color: colors.textMuted, fontSize: 14, marginRight: 4 }}>$</Text>
                <TextInput
                  value={p.exact}
                  onChangeText={v => setPerson(p.id, { exact: v })}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  style={{
                    width: 74, color: colors.text, fontSize: 15, fontWeight: '700',
                    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10,
                    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
                    textAlign: 'right',
                  }}
                />
              </View>
            )}
            {people.length > 1 && (
              <AnimatedPressable onPress={() => removePerson(p.id)} scaleValue={0.85} haptic="light">
                <X color={colors.textMuted} size={16} />
              </AnimatedPressable>
            )}
          </View>
        ))}

        {mode === 'exact' && billNum > 0 && Math.abs(exactGap) > 0.009 && (
          <Text style={{ color: exactGap > 0 ? colors.warning : colors.danger, fontSize: 12.5, fontWeight: '700', marginTop: 2 }}>
            {exactGap > 0
              ? `$${fmt(exactGap)} of the bill still unclaimed`
              : `Claims exceed the bill by $${fmt(-exactGap)}`}
          </Text>
        )}
        {mode === 'exact' && (
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 17 }}>
            Enter what each person ordered (pre-tax). Tax and tip are split in proportion.
          </Text>
        )}
      </GlassPanel>

      {/* Result */}
      {mode === 'even' ? (
        <View style={{ backgroundColor: accent, borderRadius: 28, padding: 28, alignItems: 'center', marginBottom: 14, shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 8 } }}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Each person pays</Text>
          <Text style={{ color: '#fff', fontSize: 60, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -2, lineHeight: 66 }}>${fmt(total / people.length)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>
            Incl. ${fmt(tipAmount / people.length)} tip{taxNum > 0 ? ` · $${fmt(taxNum / people.length)} tax` : ''}
          </Text>
        </View>
      ) : (
        <GlassPanel variant="medium" borderRadius={24} contentStyle={{ overflow: 'hidden' }} style={{ marginBottom: 14, borderColor: accent + '44' }}>
          {people.map((p, i) => (
            <View key={p.id} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: i < people.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '600' }} numberOfLines={1}>{p.name || `Person ${i + 1}`}</Text>
              <Text style={{ color: accent, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] }}>${fmt(owed(p))}</Text>
            </View>
          ))}
        </GlassPanel>
      )}

      {/* Breakdown */}
      <GlassPanel variant="light" borderRadius={24} contentStyle={{ overflow: 'hidden' }} style={{ marginBottom: 14 }}>
        {[
          { label: 'Subtotal', value: fmt(billNum), muted: true },
          ...(taxNum > 0 ? [{ label: 'Tax / fees', value: fmt(taxNum), muted: true }] : []),
          { label: `Tip (${effectiveTip}%)`, value: fmt(tipAmount), muted: true },
          { label: 'Total', value: fmt(total), muted: false },
        ].map((row, i, arr) => (
          <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>{row.label}</Text>
            <Text style={{ color: row.muted ? colors.textSecondary : colors.text, fontSize: 17, fontWeight: '700' }}>${row.value}</Text>
          </View>
        ))}
      </GlassPanel>

      <AnimatedPressable onPress={shareSummary} scaleValue={0.96} haptic="medium" style={{ borderRadius: 16, borderWidth: 1, borderColor: accent + '66', paddingVertical: 15, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        <ShareNetwork color={accent} size={17} weight="bold" />
        <Text style={{ color: accent, fontWeight: '800', fontSize: 15 }}>Share the split</Text>
      </AnimatedPressable>

      <EdgeFeaturePanel
        appName="Bill Splitter"
        accent={accent}
        headline="Settle without confusion"
        caption="Turn a bill into a clean shareable split, group accountability, or expense note."
        metrics={[
          { label: 'Total', value: `$${fmt(total)}` },
          { label: 'People', value: `${people.length}` },
          { label: 'Tip', value: `${effectiveTip}%` },
        ]}
        prompt="Check this bill split for fairness and explain it simply for the group."
        shareText={[
          `Bill total: $${fmt(total)}`,
          ...people.map(p => `${p.name}: $${fmt(owed(p))}`),
        ].join('\n')}
        publishTitle="Bill split"
        publishBody={`Split a $${fmt(total)} bill between ${people.length} people using ${mode} mode. Tip was ${effectiveTip}%.`}
      />
    </MiniAppShell>
  );
}
