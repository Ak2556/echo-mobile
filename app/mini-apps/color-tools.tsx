import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Clipboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Copy, Check, Shuffle } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

function hexToRgb(hex: string) {
  const c = hex.replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(c)) return null;
  return { r: parseInt(c.slice(0,2),16), g: parseInt(c.slice(2,4),16), b: parseInt(c.slice(4,6),16) };
}
function rgbToHsl(r: number, g: number, b: number) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b); let h=0, s=0;
  const l=(max+min)/2;
  if (max!==min) { const d=max-min; s=l>0.5?d/(2-max-min):d/(max+min);
    switch(max){ case r: h=((g-b)/d+(g<b?6:0))/6; break; case g: h=((b-r)/d+2)/6; break; case b: h=((r-g)/d+4)/6; break; } }
  return { h: Math.round(h*360), s: Math.round(s*100), l: Math.round(l*100) };
}
function lum(r: number, g: number, b: number) {
  return [r,g,b].reduce((a,c,i) => { const s=c/255; return a + (s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4)*[0.2126,0.7152,0.0722][i]; }, 0);
}
function contrast(hex: string) {
  const rgb = hexToRgb(hex); if (!rgb) return '—';
  const L = lum(rgb.r,rgb.g,rgb.b);
  return `${((1+0.05)/(L+0.05)).toFixed(1)}:1 vs white · ${((L+0.05)/0.05).toFixed(1)}:1 vs black`;
}

const PALETTES = [
  { name: 'Blue', colors: ['#DBEAFE','#93C5FD','#60A5FA','#3B82F6','#2563EB','#1D4ED8','#1E40AF'] },
  { name: 'Green', colors: ['#D1FAE5','#6EE7B7','#34D399','#10B981','#059669','#047857','#065F46'] },
  { name: 'Red', colors: ['#FEE2E2','#FCA5A5','#F87171','#EF4444','#DC2626','#B91C1C','#7F1D1D'] },
  { name: 'Purple', colors: ['#EDE9FE','#C4B5FD','#A78BFA','#8B5CF6','#7C3AED','#6D28D9','#4C1D95'] },
  { name: 'Orange', colors: ['#FFEDD5','#FDBA74','#FB923C','#F97316','#EA580C','#C2410C','#7C2D12'] },
  { name: 'Pink', colors: ['#FCE7F3','#FBCFE8','#F9A8D4','#F472B6','#EC4899','#DB2777','#9D174D'] },
];

const RANDOMS = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#06B6D4','#84CC16','#F97316','#6366F1'];

export default function ColorToolsScreen() {
  const { colors, fontSizes } = useTheme();
  const router = useRouter();
  const [hex, setHex] = useState('#3B82F6');
  const [inputHex, setInputHex] = useState('#3B82F6');
  const [copied, setCopied] = useState('');
  const [saved, setSaved] = useState<string[]>([]);

  const rgb = hexToRgb(hex);
  const hsl = rgb ? rgbToHsl(rgb.r,rgb.g,rgb.b) : null;
  const textColor = rgb && lum(rgb.r,rgb.g,rgb.b) > 0.179 ? '#000' : '#fff';

  const applyHex = (h: string) => {
    const c = h.startsWith('#') ? h : `#${h}`;
    setInputHex(c);
    if (/^#[0-9A-Fa-f]{6}$/.test(c)) setHex(c);
  };
  const copyVal = (v: string) => { Clipboard.setString(v); setCopied(v); setTimeout(()=>setCopied(''),2000); };
  const randomize = () => { const c = RANDOMS[Math.floor(Math.random()*RANDOMS.length)]; setHex(c); setInputHex(c); };
  const save = () => { if (!saved.includes(hex)) setSaved(s=>[hex,...s].slice(0,20)); };

  const CRow = ({ label, value }: { label: string; value: string }) => (
    <Pressable onPress={() => copyVal(value)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', width: 52 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 14, fontFamily: 'monospace', flex: 1 }}>{value}</Text>
      {copied === value ? <Check color="#10B981" size={16} weight="bold" /> : <Copy color={colors.textMuted} size={16} />}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center', marginRight: 16 }}>
          <ArrowLeft color={colors.text} size={20} weight="bold" />
        </Pressable>
        <View>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: fontSizes.title }}>Color Tools</Text>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>HEX · RGB · HSL · palettes</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        {/* Hero swatch */}
        <View style={{ height: 160, borderRadius: 28, backgroundColor: hex, alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: hex, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } }}>
          <TextInput
            value={inputHex}
            onChangeText={applyHex}
            autoCapitalize="characters"
            style={{ color: textColor, fontSize: 32, fontWeight: '700', fontFamily: 'monospace', textAlign: 'center' }}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={randomize} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.25)' }}>
              <Shuffle color={textColor} size={15} weight="bold" />
              <Text style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>Random</Text>
            </Pressable>
            <Pressable onPress={save} style={{ paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.25)' }}>
              <Text style={{ color: textColor, fontSize: 13, fontWeight: '600' }}>💾 Save</Text>
            </Pressable>
          </View>
        </View>

        {/* Conversions */}
        {rgb && hsl && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 20, paddingTop: 16 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 }}>FORMATS — tap to copy</Text>
            <CRow label="HEX" value={hex.toUpperCase()} />
            <CRow label="RGB" value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`} />
            <CRow label="HSL" value={`hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`} />
            <CRow label="Contrast" value={contrast(hex)} />
            <View style={{ height: 4 }} />
          </View>
        )}

        {/* Saved */}
        {saved.length > 0 && (
          <View style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>SAVED</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {saved.map(c => (
                <Pressable key={c} onPress={() => { setHex(c); setInputHex(c); }}
                  style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c, borderWidth: hex===c ? 3 : 0, borderColor: '#fff', shadowColor: c, shadowOpacity: hex===c ? 0.5 : 0, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }} />
              ))}
            </View>
          </View>
        )}

        {/* Palettes */}
        {PALETTES.map(pal => (
          <View key={pal.name} style={{ backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 20 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>{pal.name.toUpperCase()}</Text>
            <View style={{ flexDirection: 'row', gap: 6, height: 48 }}>
              {pal.colors.map(c => (
                <Pressable key={c} onPress={() => { setHex(c); setInputHex(c); }}
                  style={{ flex: 1, borderRadius: 12, backgroundColor: c, borderWidth: hex===c ? 3 : 0, borderColor: '#fff' }} />
              ))}
            </View>
          </View>
        ))}
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
