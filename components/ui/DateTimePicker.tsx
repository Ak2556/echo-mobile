import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/theme';
import { localDayKey } from '../../lib/localDate';

const ITEM_HEIGHT = 50;

interface DrumPickerProps {
  items: { label: string; value: number | string }[];
  value: number | string;
  onChange: (val: number | string) => void;
  flex?: number;
}

function DrumPicker({ items, value, onChange, flex = 1 }: DrumPickerProps) {
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

  const paddedItems = [
    { label: '', value: 'pad-top-1' },
    { label: '', value: 'pad-top-2' },
    ...items,
    { label: '', value: 'pad-bot-1' },
    { label: '', value: 'pad-bot-2' },
  ];

  return (
    <View style={{ height: ITEM_HEIGHT * 5, overflow: 'hidden', flex }}>
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
                fontSize: isSelected ? 20 : 16,
                fontWeight: isSelected ? '800' : '500',
                color: isSelected ? colors.text : colors.textMuted,
                opacity: item.label === '' ? 0 : 1
              }} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

export interface DateTimePickerProps {
  value: { date: string; hour: number; minute: number }; // YYYY-MM-DD date, 24-hour hour
  onChange: (val: { date: string; hour: number; minute: number }) => void;
}

function generateDates() {
  const dates = [];
  const today = new Date();
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const dateStr = localDayKey(d);
    let label = '';
    if (i === 0) {
      label = 'Today';
    } else if (i === 1) {
      label = 'Tomorrow';
    } else {
      label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }
    dates.push({ label, value: dateStr });
  }
  return dates;
}

export function DateTimePicker({ value, onChange }: DateTimePickerProps) {
  const { colors } = useTheme();

  const isPM = value.hour >= 12;
  const hour12 = value.hour % 12 === 0 ? 12 : value.hour % 12;

  const dates = generateDates();
  const hours = Array.from({ length: 12 }).map((_, i) => ({ label: `${i + 1}`, value: i + 1 }));
  const minutes = Array.from({ length: 60 }).map((_, i) => ({ label: i.toString().padStart(2, '0'), value: i }));
  const ampm = [
    { label: 'AM', value: 'AM' },
    { label: 'PM', value: 'PM' }
  ];

  const handleDate = (d: number | string) => {
    onChange({ ...value, date: d as string });
  };

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
    <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: ITEM_HEIGHT * 5, backgroundColor: colors.surfaceHover, borderRadius: 20, overflow: 'hidden', paddingHorizontal: 4 }}>
      <View style={{ position: 'absolute', top: ITEM_HEIGHT * 2, left: 8, right: 8, height: ITEM_HEIGHT, backgroundColor: colors.surface, borderRadius: 12, zIndex: -1 }} />
      <DrumPicker flex={2.5} items={dates} value={value.date} onChange={handleDate} />
      <DrumPicker flex={1} items={hours} value={hour12} onChange={handleHour} />
      <DrumPicker flex={1} items={minutes} value={value.minute} onChange={handleMinute} />
      <DrumPicker flex={1} items={ampm} value={isPM ? 'PM' : 'AM'} onChange={handleAmPm} />
    </View>
  );
}
