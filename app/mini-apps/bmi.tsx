import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';

type Unit = 'metric' | 'imperial';

const CATS = [
  { label: 'Underweight', range: '< 18.5', color: '#38BDF8', min: 0, max: 18.5, emoji: '📉', advice: 'Consider consulting a nutritionist to reach a healthy weight.' },
  { label: 'Normal', range: '18.5–24.9', color: '#22C55E', min: 18.5, max: 25, emoji: '✅', advice: 'You\'re in the healthy range. Keep it up!' },
  { label: 'Overweight', range: '25–29.9', color: '#F59E0B', min: 25, max: 30, emoji: '⚠️', advice: 'Light diet changes and regular exercise can help.' },
  { label: 'Obese I', range: '30–34.9', color: '#F97316', min: 30, max: 35, emoji: '🔶', advice: 'Consult a doctor and consider a structured program.' },
  { label: 'Obese II', range: '35–39.9', color: '#EF4444', min: 35, max: 40, emoji: '🔴', advice: 'Medical supervision is strongly recommended.' },
  { label: 'Obese III', range: '≥ 40', color: '#991B1B', min: 40, max: 99, emoji: '🚨', advice: 'Please seek professional medical advice immediately.' },
];

function getCat(bmi: number) {
  return CATS.find(c => bmi >= c.min && bmi < c.max) ?? CATS[CATS.length - 1];
}

function InputField({ label, value, onChange, placeholder, unit }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; unit?: string }) {
  const { colors, fontSizes } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', backgroundColor: colors.surfaceHover, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1.5, borderColor: value ? colors.accent + '66' : colors.border }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 22, fontWeight: '300' }}
        />
        {unit && <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 4, marginBottom: 2 }}>{unit}</Text>}
      </View>
    </View>
  );
}

export default function BmiScreen() {
  const { colors, radius, fontSizes } = useTheme();
  const router = useRouter();

  const [unit, setUnit] = useState<Unit>('metric');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');

  const calcBmi = (): number | null => {
    const w = parseFloat(weight);
    const wKg = unit === 'imperial' ? w * 0.453592 : w;
    let hM: number;
    if (unit === 'metric') {
      hM = parseFloat(height) / 100;
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      hM = (ft * 12 + inch) * 0.0254;
    }
    if (!wKg || !hM || hM <= 0) return null;
    return wKg / (hM * hM);
  };

  const bmi = calcBmi();
  const cat = bmi ? getCat(bmi) : null;
  const pct = bmi ? Math.min(100, Math.max(0, ((bmi - 10) / 35) * 100)) : 0;

  const getIdealRange = (): string => {
    let hM: number;
    if (unit === 'metric') hM = parseFloat(height) / 100;
    else { const ft = parseFloat(heightFt)||0, inch = parseFloat(heightIn)||0; hM = (ft*12+inch)*0.0254; }
    if (!hM) return '—';
    const minKg = 18.5*hM*hM, maxKg = 24.9*hM*hM;
    return unit === 'metric' ? `${minKg.toFixed(1)}–${maxKg.toFixed(1)} kg` : `${(minKg/0.453592).toFixed(1)}–${(maxKg/0.453592).toFixed(1)} lbs`;
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>BMI Calculator</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>Body mass index</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Unit toggle */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surfaceHover, borderRadius: 18, padding: 4 }}>
          {(['metric', 'imperial'] as Unit[]).map(u => (
            <Pressable key={u} onPress={() => setUnit(u)} style={{ flex: 1, paddingVertical: 11, borderRadius: 14, backgroundColor: unit === u ? colors.accent : 'transparent', alignItems: 'center', shadowColor: unit === u ? colors.accent : 'transparent', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>
              <Text style={{ color: unit === u ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 14 }}>
                {u === 'metric' ? '🌍 Metric' : '🇺🇸 Imperial'}
              </Text>
              <Text style={{ color: unit === u ? 'rgba(255,255,255,0.7)' : colors.textMuted, fontSize: 11, marginTop: 2 }}>
                {u === 'metric' ? 'kg · cm' : 'lbs · ft'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Inputs */}
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20, gap: 16 }}>
          <InputField
            label={`WEIGHT (${unit === 'metric' ? 'kg' : 'lbs'})`}
            value={weight} onChange={setWeight}
            placeholder={unit === 'metric' ? '70' : '154'}
            unit={unit === 'metric' ? 'kg' : 'lbs'}
          />
          {unit === 'metric' ? (
            <InputField label="HEIGHT (cm)" value={height} onChange={setHeight} placeholder="175" unit="cm" />
          ) : (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <InputField label="FEET" value={heightFt} onChange={setHeightFt} placeholder="5" unit="ft" />
              <InputField label="INCHES" value={heightIn} onChange={setHeightIn} placeholder="9" unit="in" />
            </View>
          )}
        </View>

        {/* Result */}
        {bmi && cat && (
          <>
            {/* BMI big display */}
            <View style={{ backgroundColor: cat.color + '18', borderRadius: 28, borderWidth: 1.5, borderColor: cat.color + '44', padding: 28, alignItems: 'center', shadowColor: cat.color, shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 6 } }}>
              <Text style={{ fontSize: 32, marginBottom: 4 }}>{cat.emoji}</Text>
              <Text style={{ color: cat.color, fontSize: 80, fontWeight: '200', letterSpacing: -5, lineHeight: 84 }}>{bmi.toFixed(1)}</Text>
              <Text style={{ color: cat.color, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>{cat.label}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>BMI range: {cat.range}</Text>
            </View>

            {/* Scale bar */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 }}>BMI SCALE</Text>
              <View style={{ height: 14, borderRadius: 7, overflow: 'hidden', flexDirection: 'row', marginBottom: 8 }}>
                {CATS.slice(0, 5).map((c, i) => (
                  <View key={i} style={{ flex: 1, backgroundColor: c.color }} />
                ))}
              </View>
              {/* Indicator */}
              <View style={{ position: 'relative', height: 20 }}>
                <View style={{ position: 'absolute', left: `${pct}%`, top: 0, width: 3, height: 20, backgroundColor: '#fff', borderRadius: 2, marginLeft: -1.5 }} />
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                {['10', '18.5', '25', '30', '40'].map(v => (
                  <Text key={v} style={{ color: colors.textMuted, fontSize: 10 }}>{v}</Text>
                ))}
              </View>
            </View>

            {/* Stats */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              {[
                { label: 'Ideal weight range', value: getIdealRange() },
                { label: 'Category', value: `${cat.label} (${cat.range})` },
              ].map((row, i) => (
                <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: i === 0 ? 1 : 0, borderBottomColor: colors.border }}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>{row.label}</Text>
                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{row.value}</Text>
                </View>
              ))}
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: cat.color + '12', borderTopWidth: 1, borderTopColor: colors.border }}>
                <Text style={{ color: cat.color, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>{cat.advice}</Text>
              </View>
            </View>

            {/* Category legend */}
            <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
              <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>ALL CATEGORIES</Text>
              </View>
              {CATS.map((c, i) => (
                <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: i < CATS.length - 1 ? 1 : 0, borderBottomColor: colors.border, backgroundColor: cat.label === c.label ? c.color + '12' : 'transparent' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.color, marginRight: 12 }} />
                  <Text style={{ color: cat.label === c.label ? c.color : colors.text, flex: 1, fontSize: 14, fontWeight: cat.label === c.label ? '700' : '400' }}>{c.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.range}</Text>
                </View>
              ))}
            </View>
          </>
        )}
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
