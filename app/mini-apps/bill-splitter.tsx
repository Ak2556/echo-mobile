import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Minus, Plus, Users } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { useTheme } from '../../lib/theme';

const TIP_PRESETS = [0, 5, 10, 15, 18, 20, 25];

export default function BillSplitterScreen() {
  const { colors } = useTheme();
  const accent = colors.accent;

  const [bill, setBill] = useState('');
  const [tipPct, setTipPct] = useState(15);
  const [people, setPeople] = useState(2);
  const [customTip, setCustomTip] = useState('');

  const billNum = parseFloat(bill) || 0;
  const effectiveTip = customTip !== '' ? parseFloat(customTip) || 0 : tipPct;
  const tipAmount = billNum * (effectiveTip / 100);
  const total = billNum + tipAmount;
  const perPerson = people > 0 ? total / people : 0;
  const tipPerPerson = people > 0 ? tipAmount / people : 0;
  const fmt = (n: number) => n.toFixed(2);

  return (
    <MiniAppShell title="Bill Splitter" subtitle="Split & tip calculator">
      {/* Bill input */}
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
      </GlassPanel>

      {/* Tip */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TIP</Text>
          <Text style={{ color: accent, fontSize: 20, fontWeight: '700' }}>{effectiveTip}%</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {TIP_PRESETS.map(t => (
            <Pressable
              key={t}
              onPress={() => { setTipPct(t); setCustomTip(''); }}
              style={{
                paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
                backgroundColor: tipPct === t && customTip === '' ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: tipPct === t && customTip === '' ? 'transparent' : colors.glassBorder,
              }}
            >
              <Text style={{ color: tipPct === t && customTip === '' ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>
                {t === 0 ? 'None' : `${t}%`}
              </Text>
            </Pressable>
          ))}
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

      {/* People */}
      <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 16 }}>SPLIT BETWEEN</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable
            onPress={() => setPeople(p => Math.max(1, p - 1))}
            style={{
              width: 50, height: 50, borderRadius: 25,
              backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
              alignItems: 'center', justifyContent: 'center',
              borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder,
            }}
          >
            <Minus color={colors.text} size={22} weight="bold" />
          </Pressable>
          <View style={{ alignItems: 'center' }}>
            <Text style={{ color: colors.text, fontSize: 56, fontWeight: '200', letterSpacing: -3, lineHeight: 60 }}>{people}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Users color={colors.textMuted} size={14} weight="fill" />
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>{people === 1 ? 'person' : 'people'}</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setPeople(p => p + 1)}
            style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
          >
            <Plus color="#fff" size={22} weight="bold" />
          </Pressable>
        </View>
      </GlassPanel>

      {/* Hero result */}
      <View style={{ backgroundColor: accent, borderRadius: 28, padding: 28, alignItems: 'center', marginBottom: 14, shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 8 } }}>
        <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Each person pays</Text>
        <Text style={{ color: '#fff', fontSize: 64, fontWeight: '700', letterSpacing: -3, lineHeight: 68 }}>${fmt(perPerson)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>Incl. ${fmt(tipPerPerson)} tip</Text>
      </View>

      {/* Breakdown */}
      <GlassPanel variant="light" borderRadius={24} contentStyle={{ overflow: 'hidden' }}>
        {[
          { label: 'Subtotal', value: fmt(billNum), muted: true },
          { label: `Tip (${effectiveTip}%)`, value: fmt(tipAmount), muted: true },
          { label: 'Total', value: fmt(total), muted: false },
        ].map((row, i, arr) => (
          <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>{row.label}</Text>
            <Text style={{ color: row.muted ? colors.textSecondary : colors.text, fontSize: 17, fontWeight: '700' }}>${row.value}</Text>
          </View>
        ))}
      </GlassPanel>
    </MiniAppShell>
  );
}
