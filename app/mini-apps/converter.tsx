import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { ArrowsLeftRight } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { useTheme } from '../../lib/theme';

interface Unit { label: string; toBase: number }
interface Category { name: string; marker: string; units: Unit[] }

const CATEGORIES: Category[] = [
  { name: 'Length', marker: 'L', units: [
    { label: 'Meter', toBase: 1 }, { label: 'Kilometer', toBase: 1000 }, { label: 'Mile', toBase: 1609.344 },
    { label: 'Foot', toBase: 0.3048 }, { label: 'Inch', toBase: 0.0254 }, { label: 'Centimeter', toBase: 0.01 },
    { label: 'Yard', toBase: 0.9144 }, { label: 'Millimeter', toBase: 0.001 },
  ]},
  { name: 'Weight', marker: 'W', units: [
    { label: 'Kilogram', toBase: 1 }, { label: 'Gram', toBase: 0.001 }, { label: 'Pound', toBase: 0.453592 },
    { label: 'Ounce', toBase: 0.0283495 }, { label: 'Ton', toBase: 1000 }, { label: 'Stone', toBase: 6.35029 },
  ]},
  { name: 'Temperature', marker: 'T', units: [
    { label: '°Celsius', toBase: 1 }, { label: '°Fahrenheit', toBase: 1 }, { label: 'Kelvin', toBase: 1 },
  ]},
  { name: 'Volume', marker: 'V', units: [
    { label: 'Liter', toBase: 1 }, { label: 'Milliliter', toBase: 0.001 }, { label: 'Gallon (US)', toBase: 3.78541 },
    { label: 'Cup', toBase: 0.236588 }, { label: 'Fluid oz', toBase: 0.0295735 }, { label: 'Cubic m', toBase: 1000 },
  ]},
  { name: 'Speed', marker: 'S', units: [
    { label: 'm/s', toBase: 1 }, { label: 'km/h', toBase: 0.277778 }, { label: 'mph', toBase: 0.44704 },
    { label: 'knot', toBase: 0.514444 }, { label: 'ft/s', toBase: 0.3048 },
  ]},
  { name: 'Area', marker: 'A', units: [
    { label: 'm²', toBase: 1 }, { label: 'km²', toBase: 1e6 }, { label: 'acre', toBase: 4046.86 },
    { label: 'hectare', toBase: 10000 }, { label: 'ft²', toBase: 0.092903 },
  ]},
];

function convertTemp(val: number, from: string, to: string): number {
  const c = from === '°Fahrenheit' ? (val - 32) * 5 / 9 : from === 'Kelvin' ? val - 273.15 : val;
  return to === '°Celsius' ? c : to === '°Fahrenheit' ? c * 9 / 5 + 32 : c + 273.15;
}

export default function ConverterScreen() {
  const { colors } = useTheme();
  const [catIdx, setCatIdx] = useState(0);
  const [fromIdx, setFromIdx] = useState(0);
  const [toIdx, setToIdx] = useState(1);
  const [input, setInput] = useState('1');

  const cat = CATEGORIES[catIdx];
  const accent = colors.accent;

  const convert = (): string => {
    const v = parseFloat(input);
    if (isNaN(v)) return '—';
    if (cat.name === 'Temperature') return String(+convertTemp(v, cat.units[fromIdx].label, cat.units[toIdx].label).toFixed(6));
    return String(+(v * cat.units[fromIdx].toBase / cat.units[toIdx].toBase).toFixed(8));
  };

  const swap = () => { setFromIdx(toIdx); setToIdx(fromIdx); };
  const result = convert();

  return (
    <MiniAppShell title="Converter" subtitle="Units & measures" scrollPadding={0}>
      {/* Category pills */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12, paddingTop: 4 }}>
        {CATEGORIES.map((c, i) => (
          <Pressable
            key={c.name}
            onPress={() => { setCatIdx(i); setFromIdx(0); setToIdx(1); setInput('1'); }}
            style={{
              paddingHorizontal: 16, paddingVertical: 10, borderRadius: 16,
              backgroundColor: i === catIdx ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: i === catIdx ? 'transparent' : colors.glassBorder,
              shadowColor: i === catIdx ? accent : 'transparent',
              shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Text style={{ color: i === catIdx ? '#fff' : colors.text, fontWeight: '700', fontSize: 14 }}>{c.marker} · {c.name}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 14 }} showsVerticalScrollIndicator={false}>
        {/* FROM */}
        <GlassPanel variant="medium" borderRadius={24} style={{ borderColor: accent + '55', borderWidth: 1 }} contentStyle={{ padding: 20 }}>
          <Text style={{ color: accent, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>FROM</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            keyboardType="decimal-pad"
            style={{ color: colors.text, fontSize: 44, fontWeight: '200', letterSpacing: -1, marginBottom: 14 }}
            placeholderTextColor={colors.textMuted}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {cat.units.map((u, i) => (
                <Pressable
                  key={u.label}
                  onPress={() => setFromIdx(i)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                    backgroundColor: i === fromIdx ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: i === fromIdx ? 'transparent' : colors.glassBorder,
                  }}
                >
                  <Text style={{ color: i === fromIdx ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{u.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </GlassPanel>

        {/* Swap */}
        <Pressable
          onPress={swap}
          style={{
            alignSelf: 'center', width: 52, height: 52, borderRadius: 26,
            backgroundColor: accent, alignItems: 'center', justifyContent: 'center',
            shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 4 },
          }}
        >
          <ArrowsLeftRight color="#fff" size={22} weight="bold" />
        </Pressable>

        {/* TO */}
        <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>TO</Text>
          <Text style={{ color: accent, fontSize: 44, fontWeight: '200', letterSpacing: -1, marginBottom: 14 }} numberOfLines={1} adjustsFontSizeToFit>{result}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {cat.units.map((u, i) => (
                <Pressable
                  key={u.label}
                  onPress={() => setToIdx(i)}
                  style={{
                    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12,
                    backgroundColor: i === toIdx ? accent : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'),
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: i === toIdx ? 'transparent' : colors.glassBorder,
                  }}
                >
                  <Text style={{ color: i === toIdx ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{u.label}</Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
        </GlassPanel>

        {/* Formula */}
        <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 16, alignItems: 'center' }}>
          <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{input || '0'} {cat.units[fromIdx]?.label}</Text>
            {'  =  '}
            <Text style={{ color: accent, fontWeight: '700' }}>{result} {cat.units[toIdx]?.label}</Text>
          </Text>
        </GlassPanel>
      </ScrollView>
    </MiniAppShell>
  );
}
