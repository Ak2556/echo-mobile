import React, { useMemo, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { CheckCircle, CircleDashed, Plus, ShoppingCart, Trash } from 'phosphor-react-native';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniEmptyState, MiniChip, MiniCommandDeck, MiniStatCard } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  SHOPPING_CATEGORIES, ShoppingItem, loadShoppingList,
  saveShoppingList, shoppingStats,
} from '../../lib/shoppingList';

export default function ShoppingListScreen() {
  const { colors } = useTheme();
  const accent = '#7A8B4E'; // olive — warm editorial palette
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [category, setCategory] = useState('Produce');
  const [filter, setFilter] = useState('All');

  useFocusEffect(React.useCallback(() => {
    loadShoppingList().then(setItems).catch(() => setItems([]));
  }, []));

  const stats = shoppingStats(items);
  const categories = useMemo(() => ['All', ...SHOPPING_CATEGORIES], []);
  const visible = useMemo(() => {
    const base = filter === 'All' ? items : items.filter(item => item.category === filter);
    return base;
  }, [filter, items]);

  const update = (next: ShoppingItem[]) => {
    setItems(next);
    void saveShoppingList(next);
  };

  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    update([{
      id: `${Date.now()}`,
      name: clean,
      quantity: quantity.trim() || '1',
      category,
      checked: false,
      createdAt: new Date().toISOString(),
    }, ...items]);
    setName('');
    setQuantity('1');
    showToast('Item added', 'Shopping');
  };

  const toggle = (item: ShoppingItem) => {
    update(items.map(row => row.id === item.id ? { ...row, checked: !row.checked } : row));
  };

  const remove = (item: ShoppingItem) => {
    update(items.filter(row => row.id !== item.id));
  };

  const clearChecked = () => {
    update(items.filter(item => !item.checked));
  };

  return (
    <MiniAppShell title="Shopping List" subtitle="Buy">
      <MiniCommandDeck
        accent={accent}
        title="Shop with less waste"
        subtitle="Essentials, grouped."
        metrics={[
          { label: 'Left', value: `${stats.remaining}`, detail: 'to buy' },
          { label: 'Checked', value: `${stats.checked}`, detail: 'done' },
          { label: 'Groups', value: `${stats.categories}`, detail: 'aisles' },
        ]}
        chips={['Store run', 'Budget check', 'Recurring essentials']}
      />
      <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Add item..."
            placeholderTextColor={colors.textMuted}
            style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '800', paddingVertical: 8 }}
            returnKeyType="done"
            onSubmitEditing={add}
          />
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Qty"
            placeholderTextColor={colors.textMuted}
            style={{ width: 64, color: colors.text, fontSize: 15, fontWeight: '800', paddingVertical: 8, textAlign: 'center' }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SHOPPING_CATEGORIES.map(item => (
            <MiniChip key={item} accent={accent} label={item} active={category === item} onPress={() => setCategory(item)} />
          ))}
        </View>
        <Pressable onPress={add}>
          <View style={{ height: 48, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 }}>
            <Plus color="#fff" size={18} weight="bold" />
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900' }}>Add item</Text>
          </View>
        </Pressable>
      </GlassPanel>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <MiniStatCard value={`${stats.remaining}`} label="Remaining" accent={accent} />
        <MiniStatCard value={`${stats.checked}`} label="Checked" />
        <AnimatedPressable onPress={clearChecked} scaleValue={0.95} haptic="light" accessibilityRole="button" accessibilityLabel="Clear checked items" style={{ flex: 1 }}>
          <View style={{ flex: 1, borderRadius: 14, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Trash color={colors.textMuted} size={18} />
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>Clear</Text>
          </View>
        </AnimatedPressable>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {categories.map(item => (
          <MiniChip key={item} accent={accent} label={item} active={filter === item} onPress={() => setFilter(item)} />
        ))}
      </View>

      <View style={{ gap: 10 }}>
        {visible.map(item => (
          <GlassPanel key={item.id} variant="light" borderRadius={18} contentStyle={{ padding: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={() => toggle(item)} hitSlop={8}>
                {item.checked ? <CheckCircle color={accent} size={24} weight="fill" /> : <CircleDashed color={colors.textMuted} size={24} />}
              </Pressable>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: `${accent}1F`, alignItems: 'center', justifyContent: 'center' }}>
                <ShoppingCart color={accent} size={17} weight="bold" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: item.checked ? colors.textMuted : colors.text, fontSize: 15, fontWeight: '900', textDecorationLine: item.checked ? 'line-through' : 'none' }} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{item.quantity} · {item.category}</Text>
              </View>
              <Pressable onPress={() => remove(item)} hitSlop={8}>
                <Trash color={colors.textMuted} size={17} />
              </Pressable>
            </View>
          </GlassPanel>
        ))}
        {visible.length === 0 && (
          <MiniEmptyState
            accent={accent}
            icon={<ShoppingCart color={colors.textMuted} size={40} weight="thin" />}
            title="No items"
            subtitle="Add the next essentials before the next store run."
          />
        )}
      </View>

      <EdgeFeaturePanel
        appId="shopping-list"
        appName="Shopping List"
        accent={accent}
        headline="Buy what matters, forget less"
        caption="Keep essentials organized by category and turn recurring needs into smarter planning."
        metrics={[
          { label: 'Remaining', value: `${stats.remaining}` },
          { label: 'Checked', value: `${stats.checked}` },
          { label: 'Categories', value: `${stats.categories}` },
        ]}
        prompt="Review this shopping list and organize it into a faster store run."
        shareText={`Shopping list: ${stats.remaining} remaining, ${stats.checked} checked, across ${stats.categories} categories.`}
        publishTitle="Shopping plan"
        publishBody={`I have ${stats.remaining} shopping items left across ${stats.categories} categories.`}
      />
    </MiniAppShell>
  );
}
