import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, Dimensions, StyleSheet } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { useTheme } from '../../lib/theme';

const { width } = Dimensions.get('window');
const GAP = 10;
const PAD = 16;
const BTN = (width - PAD * 2 - GAP * 3) / 4;

type BtnType = 'number' | 'op' | 'action' | 'equals';
interface Btn { label: string; type: BtnType; wide?: boolean }

const ROWS: Btn[][] = [
  [{ label: 'AC', type: 'action' }, { label: '+/-', type: 'action' }, { label: '%', type: 'op' }, { label: '÷', type: 'op' }],
  [{ label: '7', type: 'number' }, { label: '8', type: 'number' }, { label: '9', type: 'number' }, { label: '×', type: 'op' }],
  [{ label: '4', type: 'number' }, { label: '5', type: 'number' }, { label: '6', type: 'number' }, { label: '−', type: 'op' }],
  [{ label: '1', type: 'number' }, { label: '2', type: 'number' }, { label: '3', type: 'number' }, { label: '+', type: 'op' }],
  [{ label: '0', type: 'number', wide: true }, { label: '.', type: 'number' }, { label: '=', type: 'equals' }],
];

const SCI = ['sin', 'cos', 'tan', '√', 'x²', 'π'];

function CalcBtn({ btn, accent, colors, onPress }: { btn: Btn; accent: string; colors: any; onPress: () => void }) {
  const scale = useSharedValue(1);
  const aStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const w = btn.wide ? BTN * 2 + GAP : BTN;

  const bgColor = btn.type === 'op' || btn.type === 'equals'
    ? accent
    : btn.type === 'action'
    ? (colors.isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)')
    : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)');

  const textColor = btn.type === 'op' || btn.type === 'equals' ? '#fff' : colors.text;

  return (
    <Pressable
      onPress={() => {
        scale.value = withSequence(withSpring(0.88, { damping: 10, stiffness: 500 }), withSpring(1, { damping: 12 }));
        onPress();
      }}
      style={{ width: w, height: BTN }}
    >
      <Animated.View
        style={[{
          width: '100%', height: '100%', borderRadius: BTN / 2,
          backgroundColor: bgColor, alignItems: btn.wide ? 'flex-start' : 'center',
          justifyContent: 'center', paddingLeft: btn.wide ? BTN / 2 : 0,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: btn.type === 'op' || btn.type === 'equals' ? 'transparent' : colors.glassBorder,
          shadowColor: btn.type === 'op' || btn.type === 'equals' ? accent : 'transparent',
          shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
        }, aStyle]}
      >
        <Text style={{ color: textColor, fontSize: 30, fontFamily: 'Fraunces_500Medium', letterSpacing: -0.5 }}>
          {btn.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const accent = colors.accent;

  const [display, setDisplay] = useState('0');
  const [prev, setPrev] = useState('');
  const [op, setOp] = useState('');
  const [freshInput, setFreshInput] = useState(true);
  const [history, setHistory] = useState<string[]>([]);
  const [expression, setExpression] = useState('');

  const pushHistory = (expr: string) => setHistory(h => [expr, ...h].slice(0, 6));

  const handleBtn = (label: string) => {
    if (label === 'AC') { setDisplay('0'); setPrev(''); setOp(''); setFreshInput(true); setExpression(''); return; }
    if (label === '+/-') { setDisplay(d => String(parseFloat(d) * -1)); return; }
    if (label === '%') { setDisplay(d => String(parseFloat(d) / 100)); return; }
    if (label === 'π') { setDisplay(String(Math.PI.toFixed(8))); setFreshInput(false); return; }
    if (['sin','cos','tan','√','x²'].includes(label)) {
      const v = parseFloat(display);
      let res = label === 'sin' ? Math.sin(v*Math.PI/180) : label === 'cos' ? Math.cos(v*Math.PI/180)
        : label === 'tan' ? Math.tan(v*Math.PI/180) : label === '√' ? Math.sqrt(v) : v*v;
      const expr = `${label}(${v}) = ${+res.toFixed(8)}`;
      pushHistory(expr); setDisplay(String(+res.toFixed(8))); setFreshInput(true);
      return;
    }
    if (['÷','×','−','+'].includes(label)) {
      setPrev(display); setOp(label); setFreshInput(true);
      setExpression(`${display} ${label}`); return;
    }
    if (label === '=') {
      if (!op || !prev) return;
      const a = parseFloat(prev), b = parseFloat(display);
      let res = op==='+' ? a+b : op==='−' ? a-b : op==='×' ? a*b : b!==0 ? a/b : NaN;
      const fmt = isNaN(res) ? 'Error' : String(+res.toFixed(10));
      pushHistory(`${a} ${op} ${b} = ${fmt}`);
      setDisplay(fmt); setPrev(''); setOp(''); setFreshInput(true); setExpression(''); return;
    }
    if (freshInput) { setDisplay(label==='.' ? '0.' : label); setFreshInput(false); }
    else setDisplay(d => { if (label==='.' && d.includes('.')) return d; if (d==='0' && label!=='.') return label; return d+label; });
  };

  const fontSize = display.length > 12 ? 36 : display.length > 8 ? 48 : 68;

  return (
    <MiniAppShell title="Calculator" subtitle="Scientific & history" scrollable={false}>
      <View style={{ flex: 1, justifyContent: 'flex-end', paddingHorizontal: PAD, paddingBottom: 24 }}>
        {/* History */}
        {history.length > 0 && (
          <ScrollView style={{ maxHeight: 72 }} showsVerticalScrollIndicator={false}>
            {history.map((h, i) => (
              <Text key={i} style={{ color: colors.textMuted, fontSize: 13, textAlign: 'right', marginBottom: 2 }} numberOfLines={1}>{h}</Text>
            ))}
          </ScrollView>
        )}
        {expression ? (
          <Text style={{ color: colors.textSecondary, fontSize: 22, textAlign: 'right', marginBottom: 4 }}>{expression}</Text>
        ) : null}
        <Text style={{ color: colors.text, fontSize, fontWeight: '200', textAlign: 'right', letterSpacing: -2, marginBottom: 20 }} numberOfLines={1} adjustsFontSizeToFit>{display}</Text>

        {/* Scientific row */}
        <View style={{ flexDirection: 'row', gap: GAP, marginBottom: 16 }}>
          {SCI.map(s => (
            <Pressable key={s} onPress={() => handleBtn(s)}
              style={{
                flex: 1, paddingVertical: 12, borderRadius: 14,
                backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
                alignItems: 'center',
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: colors.glassBorder,
              }}
            >
              <Text style={{ color: accent, fontSize: 13, fontWeight: '600' }}>{s}</Text>
            </Pressable>
          ))}
        </View>

        {/* Numpad */}
        <View style={{ gap: GAP }}>
          {ROWS.map((row, ri) => (
            <View key={ri} style={{ flexDirection: 'row', gap: GAP }}>
              {row.map(btn => <CalcBtn key={btn.label} btn={btn} accent={accent} colors={colors} onPress={() => handleBtn(btn.label)} />)}
            </View>
          ))}
        </View>
      </View>
    </MiniAppShell>
  );
}
