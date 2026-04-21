import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Minus, Plus, Users } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

const TIP_PRESETS = [0, 5, 10, 15, 18, 20, 25];

export default function BillSplitterScreen() {
  const { colors, radius, fontSizes } = useTheme();
  const router = useRouter();

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
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>Bill Splitter</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Split & tip calculator</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Bill input — hero card */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>BILL AMOUNT</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ color: colors.accent, fontSize: 42, fontWeight: '300', marginRight: 4 }}>$</Text>
            <TextInput
              value={bill}
              onChangeText={setBill}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 48, fontWeight: '200', letterSpacing: -2 }}
            />
          </View>
        </View>

        {/* Tip row */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>TIP</Text>
            <Text style={{ color: colors.accent, fontSize: 20, fontWeight: '700' }}>{effectiveTip}%</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TIP_PRESETS.map(t => (
              <Pressable
                key={t}
                onPress={() => { setTipPct(t); setCustomTip(''); }}
                style={{
                  paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12,
                  backgroundColor: tipPct === t && customTip === '' ? colors.accent : colors.surfaceHover,
                  borderWidth: 1.5, borderColor: tipPct === t && customTip === '' ? colors.accent : colors.border,
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
                backgroundColor: colors.surfaceHover, borderRadius: 12,
                paddingHorizontal: 14, paddingVertical: 10,
                borderWidth: 1.5, borderColor: customTip !== '' ? colors.accent : colors.border,
              }}
            />
            <Text style={{ color: colors.textMuted, fontSize: 16 }}>%</Text>
          </View>
        </View>

        {/* People */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 16 }}>SPLIT BETWEEN</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable
              onPress={() => setPeople(p => Math.max(1, p - 1))}
              style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border }}
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
              style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}
            >
              <Plus color="#fff" size={22} weight="bold" />
            </Pressable>
          </View>
        </View>

        {/* Each person owes — hero result */}
        <View style={{
          backgroundColor: colors.accent,
          borderRadius: 28, padding: 28, alignItems: 'center',
          shadowColor: colors.accent, shadowOpacity: 0.4, shadowRadius: 28, shadowOffset: { width: 0, height: 8 },
        }}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Each person pays</Text>
          <Text style={{ color: '#fff', fontSize: 64, fontWeight: '700', letterSpacing: -3, lineHeight: 68 }}>${fmt(perPerson)}</Text>
          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 6 }}>Incl. ${fmt(tipPerPerson)} tip</Text>
        </View>

        {/* Breakdown */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          {[
            { label: 'Subtotal', value: fmt(billNum), muted: true },
            { label: `Tip (${effectiveTip}%)`, value: fmt(tipAmount), muted: true },
            { label: 'Total', value: fmt(total), muted: false },
          ].map((row, i, arr) => (
            <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: i < arr.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.textMuted, fontSize: 15 }}>{row.label}</Text>
              <Text style={{ color: row.muted ? colors.textSecondary : colors.text, fontSize: 17, fontWeight: '700' }}>${row.value}</Text>
            </View>
          ))}
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
