import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent, StyleSheet, Platform, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../src/shared/lib/theme';

const ITEM_HEIGHT = 50;

interface DrumPickerProps {
  items: { label: string; value: number | string }[];
  value: number | string;
  onChange: (val: number | string) => void;
}

function DrumPicker({ items, value, onChange }: DrumPickerProps) {
  const { colors } = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = items.findIndex((i) => i.value === value);
    return Math.max(0, idx);
  });

  useEffect(() => {
    const idx = items.findIndex((i) => i.value === value);
    if (idx >= 0 && idx !== selectedIndex) {
      setSelectedIndex(idx);
      scrollViewRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
    }
  }, [value]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    let idx = Math.round(y / ITEM_HEIGHT);
    idx = Math.max(0, Math.min(idx, items.length - 1));
    if (idx !== selectedIndex) {
      Haptics.selectionAsync();
      setSelectedIndex(idx);
      onChange(items[idx].value);
    }
  };

  // Add empty items for padding (2 top, 2 bottom)
  const paddedItems = [
    { label: '', value: 'pad-top-1' },
    { label: '', value: 'pad-top-2' },
    ...items,
    { label: '', value: 'pad-bot-1' },
    { label: '', value: 'pad-bot-2' },
  ];

  return (
    <View style={{ height: ITEM_HEIGHT * 5, overflow: 'hidden' }}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleScroll}
        onScrollEndDrag={handleScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingVertical: 0 }}
      >
        {paddedItems.map((item, idx) => {
          const isSelected = idx - 2 === selectedIndex;
          return (
            <View key={`${item.value}-${idx}`} style={{ height: ITEM_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{
                fontSize: isSelected ? 24 : 20,
                fontWeight: isSelected ? '800' : '500',
                color: isSelected ? colors.text : colors.textMuted,
                opacity: item.label === '' ? 0 : 1
              }}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface TimePickerProps {
  value: { hour: number; minute: number }; // 24-hour
  onChange: (val: { hour: number; minute: number }) => void;
}

export function TimePicker({ value, onChange }: TimePickerProps) {
  const { colors } = useTheme();

  const isPM = value.hour >= 12;
  const hour12 = value.hour % 12 === 0 ? 12 : value.hour % 12;

  const hours = Array.from({ length: 12 }).map((_, i) => ({ label: `${i + 1}`, value: i + 1 }));
  const minutes = Array.from({ length: 60 }).map((_, i) => ({ label: i.toString().padStart(2, '0'), value: i }));
  const ampm = [
    { label: 'AM', value: 'AM' },
    { label: 'PM', value: 'PM' }
  ];

  const handleHour = (h: number | string) => {
    let newH = typeof h === 'number' ? h : parseInt(h);
    if (isPM && newH < 12) newH += 12;
    if (!isPM && newH === 12) newH = 0;
    onChange({ ...value, hour: newH });
  };

  const handleMinute = (m: number | string) => {
    onChange({ ...value, minute: typeof m === 'number' ? m : parseInt(m) });
  };

  const handleAmPm = (ap: number | string) => {
    const isNowPM = ap === 'PM';
    if (isNowPM && !isPM) {
      onChange({ ...value, hour: (value.hour + 12) % 24 });
    } else if (!isNowPM && isPM) {
      onChange({ ...value, hour: (value.hour - 12 + 24) % 24 });
    }
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_HEIGHT * 5, backgroundColor: colors.surfaceHover, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 16 }}>
      {/* Highlight bar in the center */}
      <View style={{ position: 'absolute', top: ITEM_HEIGHT * 2, left: 16, right: 16, height: ITEM_HEIGHT, backgroundColor: colors.surface, borderRadius: 12, zIndex: -1 }} />
      
      <View style={{ flex: 1 }}>
        <DrumPicker items={hours} value={hour12} onChange={handleHour} />
      </View>
      <View style={{ flex: 1 }}>
        <DrumPicker items={minutes} value={value.minute} onChange={handleMinute} />
      </View>
      <View style={{ flex: 1 }}>
        <DrumPicker items={ampm} value={isPM ? 'PM' : 'AM'} onChange={handleAmPm} />
      </View>
    </View>
  );
}
