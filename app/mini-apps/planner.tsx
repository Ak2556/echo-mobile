import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CaretLeft, CaretRight, CheckCircle, CircleDashed, Plus, Trash } from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniChip, MiniButton, MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  PLANNER_SLOTS, PlannerItem, PlannerSlot, loadPlanner, plannerStats,
  plannerToday, savePlanner, shiftPlannerDate,
} from '../../lib/planner';
import { ttx } from '../../lib/i18n';

export default function PlannerScreen() {
  const { colors, font, radius } = useTheme();
  const accent = colors.accent;
  const [items, setItems] = useState<PlannerItem[]>([]);
  const [date, setDate] = useState(plannerToday());
  const [title, setTitle] = useState('');
  const [slot, setSlot] = useState<PlannerSlot>('morning');
  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);

  useFocusEffect(React.useCallback(() => {
    loadPlanner().then((loaded) => {
      // Voice: "add plan call the bank" navigates here with ?vAction=add&vValue=…
      const a = typeof vAction === 'string' ? vAction.toLowerCase() : '';
      const text = typeof vValue === 'string' ? vValue.trim() : '';
      if (!didVoiceRef.current && a === 'add' && text) {
        didVoiceRef.current = true;
        const next: PlannerItem[] = [{
          id: `${Date.now()}`, title: text, date: plannerToday(), slot: 'morning',
          done: false, createdAt: new Date().toISOString(),
        }, ...loaded];
        setItems(next);
        void savePlanner(next);
        showToast('Plan added', 'Planner');
      } else {
        setItems(loaded);
      }
    }).catch(() => setItems([]));
  }, [vAction, vValue]));

  const dayItems = useMemo(() => items.filter(item => item.date === date), [date, items]);
  const stats = plannerStats(items, date);
  const dayLabel = date === plannerToday()
    ? 'Today'
    : new Date(`${date}T12:00:00`).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  const update = (next: PlannerItem[]) => {
    setItems(next);
    void savePlanner(next);
  };

  const add = () => {
    const clean = title.trim();
    if (!clean) return;
    update([{
      id: `${Date.now()}`,
      title: clean,
      date,
      slot,
      done: false,
      createdAt: new Date().toISOString(),
    }, ...items]);
    setTitle('');
    showToast('Plan added', 'Planner');
  };

  const toggle = (item: PlannerItem) => {
    update(items.map(row => row.id === item.id ? { ...row, done: !row.done } : row));
  };

  const remove = (item: PlannerItem) => {
    update(items.filter(row => row.id !== item.id));
  };

  return (
    <MiniAppShell title={ttx("Planner")} subtitle={ttx("Plan")}>
      <MiniCommandDeck
        accent={accent}
        title={ttx("A day you can actually run")}
        subtitle={ttx("Morning, afternoon, evening.")}
        metrics={[
          { label: 'Total', value: `${stats.total}`, detail: dayLabel },
          { label: 'Open', value: `${stats.open}`, detail: 'left' },
          { label: 'Done', value: `${stats.done}`, detail: 'closed' },
        ]}
        chips={['Rebalance day', 'Protect focus', 'End-of-day recap']}
      />
      <GlassPanel variant="light" borderRadius={radius.card} contentStyle={{ padding: 16, gap: 14 }} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable onPress={() => setDate(shiftPlannerDate(date, -1))} hitSlop={8}>
            <CaretLeft color={colors.text} size={22} weight="bold" />
          </Pressable>
          <Pressable onPress={() => setDate(plannerToday())}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ color: colors.text, fontSize: 22, fontFamily: 'Fraunces_600SemiBold' }}>{dayLabel}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{date}</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setDate(shiftPlannerDate(date, 1))} hitSlop={8}>
            <CaretRight color={colors.text} size={22} weight="bold" />
          </Pressable>
        </View>

        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={ttx("Add a plan...")}
          placeholderTextColor={colors.textMuted}
          style={{ color: colors.text, fontSize: 16, fontWeight: '700', paddingVertical: 8 }}
          returnKeyType="done"
          onSubmitEditing={add}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {PLANNER_SLOTS.map(item => (
            <MiniChip key={item.id} accent={accent} label={item.label} active={slot === item.id} onPress={() => setSlot(item.id)} />
          ))}
        </View>
        <MiniButton label={ttx("Add to day")} accent={accent} onPress={add} icon={<Plus color={colors.bgPure} size={18} weight="bold" />} />
      </GlassPanel>

      <View style={{ gap: 14 }}>
        {PLANNER_SLOTS.map(section => {
          const rows = dayItems.filter(item => item.slot === section.id);
          return (
            <View key={section.id}>
              <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 8 }]}>
                {section.label}
              </Text>
              <View style={{ gap: 8 }}>
                {rows.map(item => (
                  <GlassPanel key={item.id} variant="light" borderRadius={radius.card} contentStyle={{ padding: 13 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
                      <Pressable onPress={() => toggle(item)} hitSlop={8}>
                        {item.done ? <CheckCircle color={accent} size={23} weight="fill" /> : <CircleDashed color={colors.textMuted} size={23} />}
                      </Pressable>
                      <Text style={{ flex: 1, color: item.done ? colors.textMuted : colors.text, fontSize: 15, fontWeight: '800', textDecorationLine: item.done ? 'line-through' : 'none' }} numberOfLines={2}>
                        {item.title}
                      </Text>
                      <Pressable onPress={() => remove(item)} hitSlop={8}>
                        <Trash color={colors.textMuted} size={17} />
                      </Pressable>
                    </View>
                  </GlassPanel>
                ))}
                {rows.length === 0 && (
                  <View style={{ height: 44, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>{ttx("No")} {section.label.toLowerCase()} {ttx("plans")}</Text>
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <EdgeFeaturePanel
        appId="planner"
        appName="Planner"
        accent={accent}
        headline={ttx("Make the day easier to execute")}
        caption={ttx("Split the day into simple blocks, then ask Echo to rebalance or summarize progress.")}
        metrics={[
          { label: 'Today', value: `${stats.total}` },
          { label: 'Open', value: `${stats.open}` },
          { label: 'Done', value: `${stats.done}` },
        ]}
        prompt="Review my day plan and help me make it realistic."
        shareText={`Planner: ${stats.total} plans today, ${stats.done} done, ${stats.open} open.`}
        publishTitle="Daily plan"
        publishBody={`Today's plan has ${stats.total} items, with ${stats.open} still open.`}
      />
    </MiniAppShell>
  );
}
