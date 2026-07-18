import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Share, Clipboard } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Backspace, ClockCounterClockwise, Copy, Equals, Function as FunctionIcon, ShareNetwork } from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { useResponsiveLayout } from '../../lib/responsive';
import { showToast } from '../../components/ui/Toast';

type KeyKind = 'number' | 'operator' | 'utility' | 'science' | 'equals';
type KeySpec = { label: string; kind: KeyKind; wide?: boolean; action?: string };
type HistoryEntry = { expression: string; result: string };

const PAD = 16;
const SCI_KEYS: KeySpec[] = [
  { label: 'sin', kind: 'science' },
  { label: 'cos', kind: 'science' },
  { label: 'tan', kind: 'science' },
  { label: 'sqrt', kind: 'science', action: '√' },
  { label: 'x²', kind: 'science' },
  { label: 'π', kind: 'science' },
];

const KEY_ROWS: KeySpec[][] = [
  [
    { label: 'AC', kind: 'utility' },
    { label: '⌫', kind: 'utility', action: 'backspace' },
    { label: '%', kind: 'utility' },
    { label: '÷', kind: 'operator' },
  ],
  [
    { label: '7', kind: 'number' },
    { label: '8', kind: 'number' },
    { label: '9', kind: 'number' },
    { label: '×', kind: 'operator' },
  ],
  [
    { label: '4', kind: 'number' },
    { label: '5', kind: 'number' },
    { label: '6', kind: 'number' },
    { label: '−', kind: 'operator' },
  ],
  [
    { label: '1', kind: 'number' },
    { label: '2', kind: 'number' },
    { label: '3', kind: 'number' },
    { label: '+', kind: 'operator' },
  ],
  [
    { label: '0', kind: 'number', wide: true },
    { label: '.', kind: 'number' },
    { label: '=', kind: 'equals' },
  ],
];

function formatCalcValue(value: number): string {
  if (!Number.isFinite(value)) return 'Error';
  const rounded = Number(value.toFixed(10));
  if (Object.is(rounded, -0)) return '0';
  if (Math.abs(rounded) >= 1e12 || (Math.abs(rounded) > 0 && Math.abs(rounded) < 1e-8)) {
    return rounded.toExponential(6);
  }
  return String(rounded);
}

function compute(a: number, op: string, b: number): string {
  const value = op === '+'
    ? a + b
    : op === '−'
      ? a - b
      : op === '×'
        ? a * b
        : b === 0
          ? NaN
          : a / b;
  return formatCalcValue(value);
}

function readableKey(label: string) {
  if (label === '÷') return 'Divide';
  if (label === '×') return 'Multiply';
  if (label === '−') return 'Subtract';
  if (label === '⌫') return 'Backspace';
  if (label === '=') return 'Equals';
  return label;
}

function CalcKey({
  item,
  accent,
  colors,
  width,
  height,
  gap,
  onPress,
}: {
  item: KeySpec;
  accent: string;
  colors: any;
  width: number;
  height: number;
  gap: number;
  onPress: () => void;
}) {
  const isOperator = item.kind === 'operator';
  const isEquals = item.kind === 'equals';
  const isUtility = item.kind === 'utility';
  const keyWidth = item.wide ? width * 2 + gap : width;
  const fill = isEquals
    ? accent
    : isOperator
      ? `${accent}E6`
      : isUtility
        ? colors.isDark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.08)'
        : colors.isDark ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.62)';
  const textColor = isOperator || isEquals ? '#fff' : colors.text;
  return (
    <AnimatedPressable
      onPress={onPress}
      scaleValue={0.94}
      haptic={isEquals ? 'medium' : 'light'}
      accessibilityLabel={readableKey(item.label)}
      style={{ width: keyWidth, height }}
    >
      <View
        style={{
          flex: 1,
          borderRadius: 20,
          alignItems: item.wide ? 'flex-start' : 'center',
          justifyContent: 'center',
          paddingLeft: item.wide ? 24 : 0,
          backgroundColor: fill,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: isOperator || isEquals ? 'transparent' : colors.glassBorder,
          shadowColor: isOperator || isEquals ? accent : '#000',
          shadowOpacity: isOperator || isEquals ? 0.28 : colors.isDark ? 0.10 : 0.06,
          shadowRadius: isOperator || isEquals ? 14 : 8,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        {item.action === 'backspace' ? (
          <Backspace color={textColor} size={24} weight="bold" />
        ) : (
          <Text style={{ color: textColor, fontSize: Math.min(30, height * 0.42), fontWeight: isUtility ? '800' : '700', letterSpacing: 0 }}>
            {item.label}
          </Text>
        )}
      </View>
    </AnimatedPressable>
  );
}

function ScienceKey({ item, active, accent, colors, onPress }: { item: KeySpec; active: boolean; accent: string; colors: any; onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} scaleValue={0.94} haptic="light" style={{ flex: 1, minWidth: 42 }}>
      <View
        style={{
          height: 40,
          borderRadius: 14,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: active ? `${accent}24` : colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: active ? `${accent}70` : colors.glassBorder,
        }}
      >
        <Text style={{ color: active ? accent : colors.textSecondary, fontSize: 12.5, fontWeight: '900' }}>{item.label}</Text>
      </View>
    </AnimatedPressable>
  );
}

export default function CalculatorScreen() {
  const { colors } = useTheme();
  const layout = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const accent = colors.accent;

  const [display, setDisplay] = useState('0');
  const [stored, setStored] = useState<string | null>(null);
  const [operator, setOperator] = useState('');
  const [expression, setExpression] = useState('');
  const [freshInput, setFreshInput] = useState(true);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const pushHistory = (entry: HistoryEntry) => setHistory(prev => [entry, ...prev].slice(0, 8));

  const clearAll = () => {
    setDisplay('0');
    setStored(null);
    setOperator('');
    setExpression('');
    setFreshInput(true);
  };

  const backspace = () => {
    if (freshInput || display === 'Error') {
      setDisplay('0');
      setFreshInput(true);
      return;
    }
    setDisplay(value => value.length <= 1 || (value.length === 2 && value.startsWith('-')) ? '0' : value.slice(0, -1));
  };

  const inputNumber = (label: string) => {
    if (display === 'Error' || freshInput) {
      setDisplay(label === '.' ? '0.' : label);
      setFreshInput(false);
      return;
    }
    setDisplay(value => {
      if (label === '.' && value.includes('.')) return value;
      if (value === '0' && label !== '.') return label;
      if (value.replace('.', '').replace('-', '').length >= 14 && label !== '.') return value;
      return `${value}${label}`;
    });
  };

  const applyUnary = (action: string) => {
    const current = display === 'Error' ? 0 : parseFloat(display);
    const value = action === '+/-'
      ? current * -1
      : action === '%'
        ? current / 100
        : action === 'π'
          ? Math.PI
          : action === 'sin'
            ? Math.sin(current * Math.PI / 180)
            : action === 'cos'
              ? Math.cos(current * Math.PI / 180)
              : action === 'tan'
                ? Math.tan(current * Math.PI / 180)
                : action === '√'
                  ? current < 0 ? NaN : Math.sqrt(current)
                  : action === 'x²'
                    ? current * current
                    : current;
    const next = formatCalcValue(value);
    if (['sin', 'cos', 'tan', '√', 'x²'].includes(action)) {
      pushHistory({ expression: `${action}(${display})`, result: next });
    }
    setDisplay(next);
    setFreshInput(true);
  };

  const applyOperator = (nextOperator: string) => {
    if (display === 'Error') return;
    if (stored !== null && operator && !freshInput) {
      const result = compute(parseFloat(stored), operator, parseFloat(display));
      pushHistory({ expression: `${stored} ${operator} ${display}`, result });
      setStored(result);
      setDisplay(result);
      setExpression(`${result} ${nextOperator}`);
    } else {
      setStored(display);
      setExpression(`${display} ${nextOperator}`);
    }
    setOperator(nextOperator);
    setFreshInput(true);
  };

  const equals = () => {
    if (!operator || stored === null || display === 'Error') return;
    const result = compute(parseFloat(stored), operator, parseFloat(display));
    pushHistory({ expression: `${stored} ${operator} ${display}`, result });
    setDisplay(result);
    setStored(null);
    setOperator('');
    setExpression('');
    setFreshInput(true);
  };

  const handleKey = (item: KeySpec) => {
    const action = item.action ?? item.label;
    if (item.kind === 'number') inputNumber(action);
    else if (item.kind === 'operator') applyOperator(action);
    else if (item.kind === 'equals') equals();
    else if (action === 'AC') clearAll();
    else if (action === 'backspace') backspace();
    else applyUnary(action);
  };

  const copyResult = () => {
    Clipboard.setString(display);
    showToast('Result copied');
  };

  const shareCalculation = () => {
    const lines = history.length
      ? history.slice(0, 6).map(item => `${item.expression} = ${item.result}`)
      : [`Result: ${display}`];
    Share.share({ message: `Calculator - Echo\n${lines.join('\n')}` }).catch(() => {});
  };

  const HeaderActions = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <AnimatedPressable onPress={copyResult} haptic="light" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
        <Copy color={colors.textSecondary} size={17} weight="bold" />
      </AnimatedPressable>
      <AnimatedPressable onPress={shareCalculation} haptic="light" style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: accent, alignItems: 'center', justifyContent: 'center' }}>
        <ShareNetwork color="#fff" size={17} weight="bold" />
      </AnimatedPressable>
    </View>
  );

  const headerEstimate = insets.top + 78;
  const availableHeight = Math.max(540, layout.height - headerEstimate - 18);
  const panelWidth = Math.min(layout.contentWidth - PAD * 2, layout.isTablet ? 440 : 390);
  const gap = availableHeight < 640 ? 8 : 10;
  const keyWidth = Math.floor((panelWidth - gap * 3) / 4);
  const displayHeight = Math.max(132, Math.min(174, availableHeight * 0.26));
  const scienceHeight = 40;
  const remainingForKeys = availableHeight - displayHeight - scienceHeight - 76;
  const keyHeight = Math.max(52, Math.min(70, Math.floor((remainingForKeys - gap * 4) / 5)));
  const readoutSize = display.length > 13 ? 34 : display.length > 9 ? 44 : Math.min(58, keyHeight * 0.82);
  const activeScience = expression ? operator : '';

  return (
    <MiniAppShell title="Calculator" subtitle="Solve" headerRight={HeaderActions} scrollable={false}>
      <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 14 }}>
        <View style={{ width: panelWidth, maxWidth: '100%' }}>
          <GlassPanel
            variant="medium"
            borderRadius={24}
            elevated
            contentStyle={{ padding: 16, justifyContent: 'space-between' }}
            style={{ marginBottom: 12, borderColor: `${accent}3D`, minHeight: displayHeight }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 34, height: 34, borderRadius: 12, backgroundColor: `${accent}22`, alignItems: 'center', justifyContent: 'center' }}>
                <FunctionIcon color={accent} size={17} weight="bold" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '900' }}>Decision math</Text>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>
                  {history.length ? `${history.length} recent calculations` : 'Tap numbers to start'}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5, backgroundColor: colors.surface }}>
                <ClockCounterClockwise color={colors.textMuted} size={13} weight="bold" />
                <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '900' }}>{history.length}</Text>
              </View>
            </View>

            <View style={{ alignItems: 'flex-end', marginTop: 8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 16, fontWeight: '700', minHeight: 22 }} numberOfLines={1}>
                {expression || (stored && operator ? `${stored} ${operator}` : '')}
              </Text>
              <Text
                style={{
                  color: display === 'Error' ? colors.danger : colors.text,
                  fontSize: readoutSize,
                  lineHeight: readoutSize + 8,
                  fontWeight: '900',
                  letterSpacing: 0,
                  textAlign: 'right',
                  minHeight: readoutSize + 10,
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {display || '0'}
              </Text>
            </View>

            {history.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
                {history.slice(0, 4).map((item, index) => (
                  <AnimatedPressable
                    key={`${item.expression}-${index}`}
                    onPress={() => {
                      setDisplay(item.result);
                      setFreshInput(true);
                    }}
                    haptic="light"
                  >
                    <View style={{ maxWidth: 154, borderRadius: 13, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                      <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700' }} numberOfLines={1}>{item.expression}</Text>
                      <Text style={{ color: accent, fontSize: 13, fontWeight: '900', marginTop: 2 }} numberOfLines={1}>{item.result}</Text>
                    </View>
                  </AnimatedPressable>
                ))}
              </ScrollView>
            ) : null}
          </GlassPanel>

          <View style={{ flexDirection: 'row', gap: 7, marginBottom: 12 }}>
            {SCI_KEYS.map(item => (
              <ScienceKey
                key={item.label}
                item={item}
                active={activeScience === item.label}
                accent={accent}
                colors={colors}
                onPress={() => handleKey(item)}
              />
            ))}
          </View>

          <View style={{ gap }}>
            {KEY_ROWS.map((row, index) => (
              <View key={index} style={{ flexDirection: 'row', gap }}>
                {row.map(item => (
                  <CalcKey
                    key={item.label}
                    item={item}
                    accent={accent}
                    colors={colors}
                    width={keyWidth}
                    height={keyHeight}
                    gap={gap}
                    onPress={() => handleKey(item)}
                  />
                ))}
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            <Equals color={colors.textMuted} size={14} weight="bold" />
            <Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '700' }} numberOfLines={1}>
              Long calculations stay in recent history.
            </Text>
          </View>
        </View>
      </View>
    </MiniAppShell>
  );
}
