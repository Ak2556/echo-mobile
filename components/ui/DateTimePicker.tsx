import React, { useEffect, useRef, useState, useMemo } from 'react';
import { View, Text, NativeSyntheticEvent, NativeScrollEvent, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { 
  useAnimatedScrollHandler, 
  useSharedValue, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation,
  runOnJS,
  SharedValue
} from 'react-native-reanimated';
import { useTheme } from '../../src/shared/lib/theme';
import { localDayKey } from '../../lib/localDate';

const ITEM_HEIGHT = 44;
const VISIBLE_ITEMS = 5;

interface DrumPickerProps {
  items: { label: string; value: number | string }[];
  value: number | string;
  onChange: (val: number | string) => void;
  flex?: number;
  align?: 'center' | 'flex-start' | 'flex-end';
}

function DrumPickerItem({ 
  item, 
  index, 
  scrollY, 
  colors,
  align 
}: { 
  item: { label: string; value: number | string }; 
  index: number; 
  scrollY: SharedValue<number>; 
  colors: any;
  align: 'center' | 'flex-start' | 'flex-end';
}) {
  const style = useAnimatedStyle(() => {
    const input = [
      (index - 2) * ITEM_HEIGHT,
      (index - 1) * ITEM_HEIGHT,
      index * ITEM_HEIGHT,
      (index + 1) * ITEM_HEIGHT,
      (index + 2) * ITEM_HEIGHT
    ];
    const scale = interpolate(scrollY.value, input, [0.7, 0.85, 1.1, 0.85, 0.7], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, input, [0.1, 0.3, 1, 0.3, 0.1], Extrapolation.CLAMP);
    const rotateX = interpolate(scrollY.value, input, [45, 20, 0, -20, -45], Extrapolation.CLAMP);

    return {
      transform: [
        { scale },
        { perspective: 500 },
        { rotateX: `${rotateX}deg` }
      ],
      opacity,
    };
  });

  return (
    <Animated.View style={[{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: align }, style]}>
      <Text style={{
        fontSize: 22,
        fontWeight: '700',
        color: colors.text,
      }} numberOfLines={1}>
        {item.label}
      </Text>
    </Animated.View>
  );
}

function DrumPicker({ items, value, onChange, flex = 1, align = 'center' }: DrumPickerProps) {
  const { colors } = useTheme();
  const scrollViewRef = useRef<Animated.ScrollView>(null);
  
  const initialIdx = useMemo(() => Math.max(0, items.findIndex(i => i.value === value)), []);
  const [selectedIndex, setSelectedIndex] = useState(initialIdx);
  const scrollY = useSharedValue(initialIdx * ITEM_HEIGHT);

  useEffect(() => {
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      scrollY.value = idx * ITEM_HEIGHT;
      scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: true });
    }
  }, [value]);

  const triggerHaptic = (newIdx: number) => {
    if (newIdx !== selectedIndex && newIdx >= 0 && newIdx < items.length) {
      Haptics.selectionAsync();
      setSelectedIndex(newIdx);
    }
  };

  const handleScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      const exactIdx = e.contentOffset.y / ITEM_HEIGHT;
      const roundedIdx = Math.round(exactIdx);
      if (Math.abs(exactIdx - roundedIdx) < 0.1) {
        runOnJS(triggerHaptic)(roundedIdx);
      }
    },
    onMomentumEnd: (e) => {
      const idx = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      if (idx >= 0 && idx < items.length) {
        runOnJS(onChange)(items[idx].value);
      }
    },
  });

  const handleScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    if (idx >= 0 && idx < items.length) {
      onChange(items[idx].value);
    }
  };

  const paddedItems = [
    { label: '', value: 'pad-top-1' },
    { label: '', value: 'pad-top-2' },
    ...items,
    { label: '', value: 'pad-bot-1' },
    { label: '', value: 'pad-bot-2' },
  ];

  return (
    <View style={{ height: ITEM_HEIGHT * VISIBLE_ITEMS, flex }}>
      <Animated.ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onScroll={handleScroll}
        onScrollEndDrag={handleScrollEndDrag}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: 0 }}
        contentOffset={{ x: 0, y: initialIdx * ITEM_HEIGHT }}
      >
        {paddedItems.map((item, idx) => (
          <DrumPickerItem 
            key={`${item.value}-${idx}`} 
            item={item} 
            index={idx - 2} 
            scrollY={scrollY} 
            colors={colors}
            align={align}
          />
        ))}
      </Animated.ScrollView>
    </View>
  );
}

export interface DateTimePickerProps {
  value: { date: string; hour: number; minute: number };
  onChange: (val: { date: string; hour: number; minute: number }) => void;
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const { colors } = useTheme();

  const isPM = value.hour >= 12;
  const hour12 = value.hour % 12 === 0 ? 12 : value.hour % 12;

  const dates = useMemo(() => {
    const arr = [];
    const today = new Date();
    for (let i = 0; i < 60; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = localDayKey(d);
      let label = '';
      if (i === 0) label = 'Today';
      else if (i === 1) label = 'Tomorrow';
      else label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      arr.push({ label, value: dateStr });
    }
    return arr;
  }, []);

  const hours = useMemo(() => Array.from({ length: 12 }).map((_, i) => ({ label: `${i + 1}`, value: i + 1 })), []);
  const minutes = useMemo(() => Array.from({ length: 60 }).map((_, i) => ({ label: i.toString().padStart(2, '0'), value: i })), []);
  const ampm = useMemo(() => [{ label: 'AM', value: 'AM' }, { label: 'PM', value: 'PM' }], []);

  const handleDate = (d: number | string) => onChange({ ...value, date: d as string });
  const handleHour = (h: number | string) => {
    let newH = typeof h === 'number' ? h : parseInt(h);
    if (isPM && newH < 12) newH += 12;
    if (!isPM && newH === 12) newH = 0;
    onChange({ ...value, hour: newH });
  };
  const handleMinute = (m: number | string) => onChange({ ...value, minute: typeof m === 'number' ? m : parseInt(m) });
  const handleAmPm = (ap: number | string) => {
    const isNowPM = ap === 'PM';
    if (isNowPM && !isPM) onChange({ ...value, hour: (value.hour + 12) % 24 });
    else if (!isNowPM && isPM) onChange({ ...value, hour: (value.hour - 12 + 24) % 24 });
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_HEIGHT * VISIBLE_ITEMS, backgroundColor: colors.surface, borderRadius: 24, overflow: 'hidden', paddingHorizontal: 12 }}>
      {/* Highlight bar */}
      <View style={{ position: 'absolute', top: ITEM_HEIGHT * 2, left: 8, right: 8, height: ITEM_HEIGHT, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)', borderRadius: 12, zIndex: -1 }} />
      
      <DrumPicker flex={1.5} items={dates} value={value.date} onChange={handleDate} align="center" />
      <DrumPicker flex={0.8} items={hours} value={hour12} onChange={handleHour} align="center" />
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, marginHorizontal: 0, marginBottom: 4, opacity: 0.8 }}>:</Text>
      <DrumPicker flex={0.8} items={minutes} value={value.minute} onChange={handleMinute} align="center" />
      <DrumPicker flex={1} items={ampm} value={isPM ? 'PM' : 'AM'} onChange={handleAmPm} align="center" />
    </View>
  );
}
