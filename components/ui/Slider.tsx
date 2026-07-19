import React, { useState } from 'react';
import { View, Text, LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, runOnJS } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '../../lib/theme';

interface SliderProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (v: number) => void;
  /** Called when the drag ends — good for committing an expensive re-render. */
  onCommit?: (v: number) => void;
  accent?: string;
}

const THUMB = 22;

/**
 * A minimal bidirectional slider (default range −1…1) built on reanimated +
 * gesture-handler. The fill runs from the center so ± adjustments read clearly.
 */
export function Slider({ label, value, min = -1, max = 1, onChange, onCommit, accent }: SliderProps) {
  const { colors } = useTheme();
  const tint = accent ?? colors.accent;
  const [w, setW] = useState(0);
  const px = useSharedValue(0); // thumb center in px

  const toPx = (v: number) => (w > 0 ? ((v - min) / (max - min)) * w : 0);
  const toVal = (x: number) => min + Math.max(0, Math.min(1, x / (w || 1))) * (max - min);

  // Keep the thumb synced to external value changes (e.g. Reset).
  React.useEffect(() => { px.value = toPx(value); }, [value, w]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = (x: number) => onChange(Number(toVal(x).toFixed(3)));
  const commit = (x: number) => onCommit?.(Number(toVal(x).toFixed(3)));

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin(e => { const x = Math.max(0, Math.min(w, e.x)); px.value = x; runOnJS(emit)(x); })
    .onUpdate(e => { const x = Math.max(0, Math.min(w, e.x)); px.value = x; runOnJS(emit)(x); })
    .onEnd(e => { const x = Math.max(0, Math.min(w, e.x)); runOnJS(commit)(x); });

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: px.value - THUMB / 2 }] }));
  const fillStyle = useAnimatedStyle(() => {
    const center = w / 2;
    const left = Math.min(center, px.value);
    return { left, width: Math.abs(px.value - center) };
  });

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12, fontVariant: ['tabular-nums'] }}>
          {value > 0 ? '+' : ''}{Math.round(value * 100)}
        </Text>
      </View>
      <GestureDetector gesture={pan}>
        <View
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          style={{ height: THUMB, justifyContent: 'center' }}
        >
          <View style={{ height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.18)' }} />
          <Animated.View style={[{ position: 'absolute', height: 3, borderRadius: 2, backgroundColor: tint }, fillStyle]} />
          {/* center tick */}
          <View style={{ position: 'absolute', left: '50%', width: 1, height: 9, backgroundColor: 'rgba(255,255,255,0.28)' }} />
          <Animated.View
            style={[{
              position: 'absolute', width: THUMB, height: THUMB, borderRadius: THUMB / 2,
              backgroundColor: '#fff', borderWidth: 2, borderColor: tint,
              shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
            }, thumbStyle]}
          />
        </View>
      </GestureDetector>
    </View>
  );
}
