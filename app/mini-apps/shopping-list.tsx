import React, { useMemo, useState, useEffect } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Modal } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CheckCircle, CircleDashed, Plus, ShoppingCart, Trash, ListDashes, MagnifyingGlass, Tag, Scan, CaretDown, CurrencyDollar, ArrowLeft } from 'phosphor-react-native';
import Animated, { FadeInDown, FadeOutUp, Layout, Easing, withTiming, useAnimatedStyle, useSharedValue, interpolateColor } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniChip, MiniStatCard } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  SHOPPING_CATEGORIES, FREQUENT_ITEMS, ShoppingItem, ShoppingListInfo,
  loadShoppingData, saveShoppingData, shoppingStats
} from '../../lib/shoppingList';
import { ttx } from '../../lib/i18n';

export default function ShoppingListScreen() {
  const { colors } = useTheme();
  const accent = '#6366f1'; // Premium indigo
  
  const [lists, setLists] = useState<ShoppingListInfo[]>([]);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [currentListId, setCurrentListId] = useState<string>('default');
  
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState('Produce');
  const [filter, setFilter] = useState('All');
  
  const [isAdding, setIsAdding] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [showListSelector, setShowListSelector] = useState(false);

  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);

  useFocusEffect(React.useCallback(() => {
    loadShoppingData().then((loaded) => {
      setLists(loaded.lists);
      const a = typeof vAction === 'string' ? vAction.toLowerCase() : '';
      const text = typeof vValue === 'string' ? vValue.trim() : '';
      
      let initialListId = loaded.lists.length > 0 ? loaded.lists[0].id : 'default';
      setCurrentListId(initialListId);
      
      if (!didVoiceRef.current && a === 'add' && text) {
        didVoiceRef.current = true;
        const nextItems: ShoppingItem[] = [{
          id: `${Date.now()}`, listId: initialListId, name: text, quantity: '1', price: 0, category: 'Produce',
          checked: false, createdAt: new Date().toISOString(),
        }, ...loaded.items];
        setItems(nextItems);
        void saveShoppingData(loaded.lists, nextItems);
        showToast('Item added', 'Shopping');
      } else {
        setItems(loaded.items);
      }
    }).catch(() => {
      setLists([]);
      setItems([]);
    });
  }, [vAction, vValue]));

  const currentList = useMemo(() => lists.find(l => l.id === currentListId) || lists[0], [lists, currentListId]);
  const listItems = useMemo(() => items.filter(i => i.listId === currentListId), [items, currentListId]);
  
  const stats = useMemo(() => shoppingStats(listItems), [listItems]);
  const categories = useMemo(() => ['All', ...SHOPPING_CATEGORIES], []);
  const visible = useMemo(() => {
    return filter === 'All' ? listItems : listItems.filter(item => item.category === filter);
  }, [filter, listItems]);

  const updateItems = (next: ShoppingItem[]) => {
    setItems(next);
    void saveShoppingData(lists, next);
  };

  const add = () => {
    const clean = name.trim();
    if (!clean) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const parsedPrice = parseFloat(price) || 0;
    
    updateItems([{
      id: `${Date.now()}`,
      listId: currentListId,
      name: clean,
      quantity: quantity.trim() || '1',
      price: parsedPrice,
      category,
      checked: false,
      createdAt: new Date().toISOString(),
    }, ...items]);
    setName('');
    setQuantity('1');
    setPrice('');
    setIsAdding(false);
    showToast('Item added', 'Shopping');
  };
  
  const addFrequent = (freqItem: any) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateItems([{
      id: `${Date.now()}`,
      listId: currentListId,
      name: freqItem.name,
      quantity: '1',
      price: freqItem.price,
      category: freqItem.category,
      checked: false,
      createdAt: new Date().toISOString(),
    }, ...items]);
    showToast(`${freqItem.name} added`, 'Shopping');
    setShowScanner(false);
  };

  const toggle = (item: ShoppingItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateItems(items.map(row => row.id === item.id ? { ...row, checked: !row.checked } : row));
  };

  const remove = (item: ShoppingItem) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    updateItems(items.filter(row => row.id !== item.id));
  };

  const clearChecked = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateItems(items.filter(item => item.listId !== currentListId || !item.checked));
  };
  
  const createNewList = () => {
    const newList: ShoppingListInfo = {
      id: `list_${Date.now()}`,
      name: 'New List',
      createdAt: new Date().toISOString()
    };
    const nextLists = [...lists, newList];
    setLists(nextLists);
    setCurrentListId(newList.id);
    void saveShoppingData(nextLists, items);
    setShowListSelector(false);
  };

  return (
    <MiniAppShell title={ttx("AnyList Pro")} subtitle={ttx("Premium Shopping")}>
      
      {/* Header with List Selector */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <AnimatedPressable onPress={() => { Haptics.selectionAsync(); setShowListSelector(true); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.text }}>
            {currentList?.name || 'My List'}
          </Text>
          <CaretDown color={colors.textMuted} size={24} weight="bold" />
        </AnimatedPressable>
        <AnimatedPressable onPress={() => { Haptics.selectionAsync(); setShowScanner(true); }} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: `${accent}15`, alignItems: 'center', justifyContent: 'center' }}>
          <Scan color={accent} size={22} weight="duotone" />
        </AnimatedPressable>
      </View>

      <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 24 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Est. Total</Text>
            <Text style={{ color: colors.text, fontSize: 36, fontWeight: '900', marginTop: 4 }}>${stats.cost.toFixed(2)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 }}>Remaining</Text>
            <Text style={{ color: accent, fontSize: 36, fontWeight: '900', marginTop: 4 }}>{stats.remaining}</Text>
          </View>
        </View>
        
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <MiniStatCard value={`${stats.checked}`} label={ttx("Checked")} accent="#10b981" />
          <AnimatedPressable onPress={clearChecked} scaleValue={0.95} haptic="medium" style={{ flex: 1 }}>
            <View style={{ flex: 1, borderRadius: 16, paddingVertical: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <Trash color={colors.textMuted} size={20} />
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '800' }}>{ttx("Clear")}</Text>
            </View>
          </AnimatedPressable>
        </View>
      </GlassPanel>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>Items</Text>
        <AnimatedPressable onPress={() => setIsAdding(!isAdding)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Plus color={accent} size={20} weight="bold" />
          <Text style={{ color: accent, fontSize: 16, fontWeight: '800' }}>Add Item</Text>
        </AnimatedPressable>
      </View>

      {isAdding && (
        <Animated.View entering={FadeInDown.duration(300).easing(Easing.out(Easing.cubic))} exiting={FadeOutUp.duration(200)}>
          <GlassPanel variant="light" borderRadius={24} contentStyle={{ padding: 16, gap: 12 }} style={{ marginBottom: 16 }}>
            <TextInput
              value={name} onChangeText={setName}
              placeholder={ttx("What do you need?")} placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 18, fontWeight: '700', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
                <Text style={{ color: colors.textMuted, fontSize: 16, fontWeight: '600' }}>Qty: </Text>
                <TextInput value={quantity} onChangeText={setQuantity} style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700', paddingVertical: 10 }} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
                <CurrencyDollar color={colors.textMuted} size={18} />
                <TextInput value={price} onChangeText={setPrice} placeholder="0.00" placeholderTextColor={colors.textMuted} style={{ flex: 1, color: colors.text, fontSize: 16, fontWeight: '700', paddingVertical: 10 }} keyboardType="decimal-pad" />
              </View>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 8 }}>
              {SHOPPING_CATEGORIES.map(item => (
                <MiniChip key={item} accent={accent} label={item} active={category === item} onPress={() => { Haptics.selectionAsync(); setCategory(item); }} />
              ))}
            </ScrollView>
            <AnimatedPressable onPress={add} style={{ height: 52, borderRadius: 16, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>{ttx("Save Item")}</Text>
            </AnimatedPressable>
          </GlassPanel>
        </Animated.View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16, marginBottom: 8 }}>
        {categories.map(item => (
          <MiniChip key={item} accent={accent} label={item} active={filter === item} onPress={() => { Haptics.selectionAsync(); setFilter(item); }} />
        ))}
      </ScrollView>

      <View style={{ gap: 12, paddingBottom: 100 }}>
        {visible.map(item => (
          <Animated.View key={item.id} layout={Layout.springify().mass(0.5)} entering={FadeInDown} exiting={FadeOutUp}>
            <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <Pressable onPress={() => toggle(item)} hitSlop={12}>
                  {item.checked ? <CheckCircle color="#10b981" size={28} weight="fill" /> : <CircleDashed color={colors.textMuted} size={28} />}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: item.checked ? colors.textMuted : colors.text, fontSize: 17, fontWeight: '800', textDecorationLine: item.checked ? 'line-through' : 'none' }}>
                    {item.name}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
                    <Tag color={colors.textMuted} size={12} weight="fill" />
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>{item.category}</Text>
                    <Text style={{ color: colors.glassBorder, fontSize: 13 }}>•</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Qty: {item.quantity}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                  {item.price > 0 && (
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 4 }}>
                      ${(item.price * (parseFloat(item.quantity) || 1)).toFixed(2)}
                    </Text>
                  )}
                  <Pressable onPress={() => remove(item)} hitSlop={12} style={{ padding: 4, backgroundColor: `${colors.text}08`, borderRadius: 12 }}>
                    <Trash color={colors.textMuted} size={16} />
                  </Pressable>
                </View>
              </View>
            </GlassPanel>
          </Animated.View>
        ))}
        {visible.length === 0 && !isAdding && (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 60, opacity: 0.5 }}>
            <ShoppingCart color={colors.textMuted} size={64} weight="duotone" />
            <Text style={{ color: colors.textMuted, fontSize: 18, fontWeight: '700', marginTop: 16 }}>List is empty</Text>
          </View>
        )}
      </View>

      {/* List Selector Modal */}
      <Modal visible={showListSelector} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.bg, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, paddingBottom: 60, minHeight: 400 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text }}>Your Lists</Text>
              <Pressable onPress={() => setShowListSelector(false)} style={{ padding: 8, backgroundColor: colors.surface, borderRadius: 20 }}>
                <Text style={{ color: colors.text, fontWeight: '800' }}>Done</Text>
              </Pressable>
            </View>
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 12 }}>
              {lists.map(list => {
                const isActive = list.id === currentListId;
                return (
                  <AnimatedPressable
                    key={list.id}
                    onPress={() => {
                      Haptics.selectionAsync();
                      setCurrentListId(list.id);
                      setShowListSelector(false);
                    }}
                    style={{
                      flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20,
                      backgroundColor: isActive ? `${accent}15` : colors.surface,
                      borderWidth: 2, borderColor: isActive ? accent : 'transparent'
                    }}
                  >
                    <ListDashes color={isActive ? accent : colors.textMuted} size={24} weight="duotone" />
                    <Text style={{ flex: 1, marginLeft: 16, fontSize: 18, fontWeight: '800', color: isActive ? accent : colors.text }}>
                      {list.name}
                    </Text>
                    {isActive && <CheckCircle color={accent} size={24} weight="fill" />}
                  </AnimatedPressable>
                );
              })}
            </ScrollView>
            
            <AnimatedPressable onPress={createNewList} style={{ height: 56, borderRadius: 20, backgroundColor: colors.text, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Plus color={colors.bg} size={20} weight="bold" />
              <Text style={{ color: colors.bg, fontSize: 17, fontWeight: '900' }}>Create New List</Text>
            </AnimatedPressable>
          </View>
        </View>
      </Modal>

      {/* Scanner / Frequent Items Modal */}
      <Modal visible={showScanner} transparent animationType="slide">
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <View style={{ paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
            <Pressable onPress={() => setShowScanner(false)} style={{ padding: 12, backgroundColor: colors.surface, borderRadius: 20, marginRight: 16 }}>
              <ArrowLeft color={colors.text} size={24} weight="bold" />
            </Pressable>
            <Text style={{ fontSize: 24, fontWeight: '900', color: colors.text, flex: 1 }}>Add Items</Text>
          </View>
          
          <ScrollView contentContainerStyle={{ padding: 20, gap: 24 }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Barcode Scanner</Text>
              <View style={{ height: 160, borderRadius: 24, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                <Scan color="rgba(255,255,255,0.2)" size={80} />
                <View style={{ position: 'absolute', width: '100%', height: 2, backgroundColor: '#10b981', opacity: 0.8 }} />
                <Text style={{ color: 'rgba(255,255,255,0.7)', position: 'absolute', bottom: 16, fontWeight: '600' }}>Point at a barcode</Text>
              </View>
            </View>
            
            <View>
              <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text, marginBottom: 12 }}>Frequent Items</Text>
              <View style={{ gap: 12 }}>
                {FREQUENT_ITEMS.map((item, idx) => (
                  <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 20, backgroundColor: colors.surface }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.text }}>{item.name}</Text>
                      <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textMuted, marginTop: 4 }}>{item.category} • ${item.price.toFixed(2)}</Text>
                    </View>
                    <AnimatedPressable onPress={() => addFrequent(item)} style={{ paddingVertical: 10, paddingHorizontal: 16, backgroundColor: accent, borderRadius: 16 }}>
                      <Text style={{ color: '#fff', fontWeight: '800' }}>Add</Text>
                    </AnimatedPressable>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

    </MiniAppShell>
  );
}
