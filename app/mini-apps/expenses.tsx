import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet, Share, ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Plus, Wallet, ArrowUp, ArrowDown, Trash, X, CaretLeft, CaretRight, Export, PencilSimple, MagnifyingGlass, Gauge, Target, CalendarCheck, TrendUp, TrendDown, Receipt } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { CURRENCIES, formatPrice, getCurrencySymbol, type CurrencyCode } from '../../lib/currency';
import {
  DEFAULT_EXPENSE_CURRENCY, EXPENSE_CATS, INCOME_CATS, ExpensesDoc, Transaction, TxType, categoryMarker,
  currentMonthKey, formatDate, loadExpensesDoc, monthKey, monthLabel,
  saveExpensesDoc, shiftMonth, transactionsToCsv,
} from '../../lib/expenses';

function AddModal({ currency, onAdd, onClose }: { currency: CurrencyCode; onAdd: (tx: Transaction) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;
  const ACCENT = type === 'expense' ? colors.danger : colors.success;

  const submit = () => {
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!num || num <= 0) { showToast('Enter a valid amount', 'Error'); return; }
    if (!category) { showToast('Pick a category', 'Required'); return; }
    onAdd({ id: Date.now().toString(), type, amount: num, category, note: note.trim(), date: new Date().toISOString() });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>Add Transaction</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>

        <View style={{ padding: 20, gap: 22 }}>
          {/* Type toggle */}
          <GlassPanel variant="light" borderRadius={14} contentStyle={{ flexDirection: 'row', padding: 4 }}>
            {(['expense', 'income'] as TxType[]).map(t => (
              <Pressable key={t} onPress={() => { setType(t); setCategory(''); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: type === t ? (t === 'expense' ? colors.danger : colors.success) : 'transparent' }}>
                <Text style={{ color: type === t ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 14, textTransform: 'capitalize' }}>{t}</Text>
              </Pressable>
            ))}
          </GlassPanel>

          {/* Amount */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>AMOUNT</Text>
            <GlassPanel variant="medium" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }} style={{ borderColor: ACCENT + '44' }}>
              <Text style={{ color: ACCENT, fontSize: 22, fontWeight: '900', marginRight: 8 }}>{getCurrencySymbol(currency)}</Text>
              <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" autoFocus style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 14 }} />
            </GlassPanel>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {[10, 25, 50, 100].map(v => (
                <Pressable key={v} onPress={() => setAmount(String(v))} style={{ flex: 1 }}>
                  <View style={{ minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '900' }}>{getCurrencySymbol(currency)}{v}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Category */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {cats.map(c => (
                <Pressable key={c.label} onPress={() => setCategory(c.label)}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: category === c.label ? ACCENT + '22' : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'), borderWidth: category === c.label ? 1.5 : StyleSheet.hairlineWidth, borderColor: category === c.label ? ACCENT : colors.glassBorder }}>
                    <Text style={{ color: category === c.label ? ACCENT : colors.textMuted, fontSize: 11, fontWeight: '800' }}>{c.marker}</Text>
                    <Text style={{ color: category === c.label ? ACCENT : colors.text, fontWeight: '600', fontSize: 13 }}>{c.label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Note */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>NOTE (optional)</Text>
            <TextInput value={note} onChangeText={setNote} placeholder="What was this for?" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
          </View>

          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Add {type === 'expense' ? 'Expense' : 'Income'}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function daysInMonthKey(key: string): number {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month, 0).getDate();
}

function elapsedDaysForMonth(key: string): number {
  if (key !== currentMonthKey()) return daysInMonthKey(key);
  return new Date().getDate();
}

function MoneyPulsePanel({
  accent,
  income,
  expense,
  balance,
  budget,
  month,
  money,
}: {
  accent: string;
  income: number;
  expense: number;
  balance: number;
  budget: number | null;
  month: string;
  money: (amount: number) => string;
}) {
  const { colors } = useTheme();
  const elapsed = elapsedDaysForMonth(month);
  const totalDays = daysInMonthKey(month);
  const daysLeft = Math.max(0, totalDays - elapsed);
  const projectedSpend = elapsed > 0 ? Math.round((expense / elapsed) * totalDays) : expense;
  const remainingBudget = budget != null ? Math.max(0, budget - expense) : null;
  const dailyRoom = remainingBudget != null ? remainingBudget / Math.max(daysLeft || 1, 1) : null;
  const saveRate = income > 0 ? Math.round((balance / income) * 100) : 0;
  const pressure = !budget ? 'No budget' : projectedSpend <= budget ? 'On track' : 'Over pace';
  const pressureColor = !budget ? accent : projectedSpend <= budget ? colors.success : colors.danger;
  const tiles = [
    { label: 'Pressure', value: pressure, detail: budget ? `${Math.min(999, Math.round((projectedSpend / budget) * 100))}% pace` : 'set budget', icon: Gauge, color: pressureColor },
    { label: 'Daily room', value: dailyRoom == null ? 'Set' : money(dailyRoom), detail: `${daysLeft} days left`, icon: CalendarCheck, color: accent },
    { label: 'Projected', value: money(projectedSpend), detail: 'month end', icon: TrendUp, color: projectedSpend <= (budget ?? Number.POSITIVE_INFINITY) ? colors.success : colors.danger },
    { label: 'Save rate', value: income > 0 ? `${saveRate}%` : 'None', detail: balance >= 0 ? 'positive' : 'negative', icon: balance >= 0 ? Target : TrendDown, color: balance >= 0 ? colors.success : colors.danger },
  ];
  return (
    <GlassPanel variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14, borderColor: `${pressureColor}38` }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: `${pressureColor}20`, alignItems: 'center', justifyContent: 'center' }}>
          <Receipt color={pressureColor} size={20} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>Money pulse</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>
            Pace, room, forecast.
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {tiles.map(tile => {
          const Icon = tile.icon;
          return (
            <View key={tile.label} style={{ width: '48.5%', minHeight: 68, borderRadius: 17, padding: 11, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon color={tile.color} size={14} weight="bold" />
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase' }}>{tile.label}</Text>
              </View>
              <Text style={{ color: tile.color, fontSize: tile.value.length > 8 ? 14 : 17, fontWeight: '900', marginTop: 7 }} numberOfLines={1}>{tile.value}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>{tile.detail}</Text>
            </View>
          );
        })}
      </View>
    </GlassPanel>
  );
}

function BudgetModal({ budget, currency, onSave, onClose }: { budget: number | null; currency: CurrencyCode; onSave: (b: number | null) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [value, setValue] = useState(budget ? String(budget) : '');
  const submit = () => {
    const n = parseFloat(value.replace(/,/g, ''));
    onSave(Number.isFinite(n) && n > 0 ? n : null);
    onClose();
  };
  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>Monthly Budget</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <View style={{ padding: 20, gap: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            How much do you plan to spend per month? Leave empty to remove the budget.
          </Text>
          <GlassPanel variant="medium" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '900', marginRight: 8 }}>{getCurrencySymbol(currency)}</Text>
            <TextInput value={value} onChangeText={setValue} placeholder="1500" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" autoFocus style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 14 }} />
          </GlassPanel>
          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Save Budget</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function CurrencyModal({ value, onSelect, onClose }: { value: CurrencyCode; onSelect: (currency: CurrencyCode) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = CURRENCIES.filter(currency => !q || `${currency.code} ${currency.label}`.toLowerCase().includes(q));
  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>Currency</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <View style={{ padding: 20, gap: 14, flex: 1 }}>
          <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search USD, INR, Euro, Yen..."
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingHorizontal: 10, paddingVertical: 12 }}
            />
          </GlassPanel>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: insets.bottom + 20 }}>
            {filtered.map(currency => {
              const active = currency.code === value;
              return (
                <Pressable
                  key={currency.code}
                  onPress={() => {
                    onSelect(currency.code);
                    onClose();
                  }}
                >
                  <View style={{
                    minHeight: 58,
                    borderRadius: 16,
                    paddingHorizontal: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    backgroundColor: active ? colors.accent + '22' : colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                    borderWidth: active ? 1.5 : StyleSheet.hairlineWidth,
                    borderColor: active ? colors.accent : colors.glassBorder,
                  }}>
                    <Text style={{ fontSize: 23 }}>{currency.flag}</Text>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={{ color: active ? colors.accent : colors.text, fontSize: 15, fontWeight: '800' }}>{currency.code}</Text>
                      <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{currency.label}</Text>
                    </View>
                    <Text style={{ color: active ? colors.accent : colors.textSecondary, fontSize: 15, fontWeight: '900' }}>{currency.symbol}</Text>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function ExpensesApp() {
  const { colors } = useTheme();
  const accent = '#8B6F4E'; // caramel — warm editorial palette
  const [doc, setDoc] = useState<ExpensesDoc>({ txs: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY });
  useFocusEffect(
    React.useCallback(() => {
      loadExpensesDoc().then(setDoc);
    }, []),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [filter, setFilter] = useState<'all' | TxType>('all');
  const [month, setMonth] = useState(currentMonthKey());
  const [query, setQuery] = useState('');
  const money = (amount: number) => formatPrice(amount, doc.currency);

  const txs = doc.txs;
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();
  const inScope = searching
    ? txs.filter(t => t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q))
    : txs.filter(t => monthKey(t.date) === month);

  const income = inScope.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = inScope.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const filtered = filter === 'all' ? inScope : inScope.filter(t => t.type === filter);

  const budgetPct = doc.budget ? Math.min(100, Math.round((expense / doc.budget) * 100)) : 0;
  const overBudget = doc.budget != null && expense > doc.budget;

  const catTotals = new Map<string, number>();
  for (const t of inScope) if (t.type === 'expense') catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount);
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = topCats[0]?.[1] ?? 1;

  const update = (next: ExpensesDoc) => { setDoc(next); saveExpensesDoc(next); };

  const addTx = (tx: Transaction) => {
    update({ ...doc, txs: [tx, ...txs] });
    setMonth(monthKey(tx.date));
    showToast(`${tx.type === 'expense' ? 'Expense' : 'Income'} added`, 'Saved');
  };

  const deleteTx = (id: string) => {
    Alert.alert('Delete?', 'Remove this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => update({ ...doc, txs: txs.filter(t => t.id !== id) }) },
    ]);
  };

  const exportCsv = async () => {
    if (txs.length === 0) { showToast('Nothing to export yet', 'Export'); return; }
    const csv = transactionsToCsv(txs);
    try {
      const path = `${FS.cacheDirectory}echo-expenses.csv`;
      await FS.writeAsStringAsync(path, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export expenses' });
        return;
      }
      throw new Error('sharing unavailable');
    } catch {
      Share.share({ message: csv }).catch(() => {});
    }
  };

  const HeaderBtns = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <AnimatedPressable onPress={() => setShowCurrency(true)} scaleValue={0.88} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '900' }}>{doc.currency}</Text>
      </AnimatedPressable>
      <AnimatedPressable onPress={exportCsv} scaleValue={0.88} haptic="light" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12 }}>
        <Export color={colors.text} size={18} weight="bold" />
      </AnimatedPressable>
      <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.88} haptic="medium" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: accent, borderRadius: 12 }}>
        <Plus color="#fff" size={18} weight="bold" />
      </AnimatedPressable>
    </View>
  );

  return (
    <MiniAppShell title="Expenses" subtitle="Control" headerRight={HeaderBtns}>
      <MiniCommandDeck
        accent={balance >= 0 ? colors.success : colors.danger}
        title="Money decision board"
        subtitle="Income, spend, budget."
        metrics={[
          { label: 'Balance', value: money(Math.abs(balance)), detail: balance >= 0 ? 'positive' : 'negative' },
          { label: 'Spent', value: money(expense), detail: monthLabel(month) },
          { label: 'Budget', value: doc.budget ? `${budgetPct}%` : 'Set', detail: doc.currency },
        ]}
        chips={['Multi-currency', 'Budget pressure', 'CSV export']}
      />
      <MoneyPulsePanel
        accent={accent}
        income={income}
        expense={expense}
        balance={balance}
        budget={doc.budget}
        month={month}
        money={money}
      />
      {/* Month switcher */}
      {!searching && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <AnimatedPressable onPress={() => setMonth(shiftMonth(month, -1))} scaleValue={0.85} haptic="light" style={{ padding: 8 }}>
            <CaretLeft color={colors.text} size={18} weight="bold" />
          </AnimatedPressable>
          <Text style={{ color: colors.text, fontSize: 17, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.3 }}>{monthLabel(month)}</Text>
          <AnimatedPressable
            onPress={() => setMonth(shiftMonth(month, 1))}
            scaleValue={0.85} haptic="light" style={{ padding: 8, opacity: month >= currentMonthKey() ? 0.25 : 1 }}
            disabled={month >= currentMonthKey()}
          >
            <CaretRight color={colors.text} size={18} weight="bold" />
          </AnimatedPressable>
        </View>
      )}

      {/* Balance card */}
      <GlassPanel variant="medium" borderRadius={28} contentStyle={{ padding: 24 }} style={{ marginBottom: 14, shadowColor: balance >= 0 ? colors.success : colors.danger, shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 } }} elevated>
        <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
          {searching ? 'Matching balance' : `Balance · ${doc.currency}`}
        </Text>
        <Text style={{ color: balance >= 0 ? colors.success : colors.danger, fontSize: 40, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>
          {balance < 0 ? '-' : ''}{money(Math.abs(balance))}
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 20, gap: 12 }}>
          <View style={{ flex: 1, backgroundColor: colors.success + '18', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.success + '33' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <ArrowDown color={colors.success} size={14} weight="bold" />
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>INCOME</Text>
            </View>
            <Text style={{ color: colors.success, fontSize: 20, fontWeight: '800' }}>{money(income)}</Text>
          </View>
          <View style={{ flex: 1, backgroundColor: colors.danger + '18', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.danger + '33' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <ArrowUp color={colors.danger} size={14} weight="bold" />
              <Text style={{ color: colors.danger, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>EXPENSES</Text>
            </View>
            <Text style={{ color: colors.danger, fontSize: 20, fontWeight: '800' }}>{money(expense)}</Text>
          </View>
        </View>

        {/* Budget */}
        {!searching && (
          <Pressable onPress={() => setShowBudget(true)}>
            <View style={{ marginTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.8 }}>
                  {doc.budget ? `BUDGET · ${money(expense)} of ${money(doc.budget)}` : 'SET A MONTHLY BUDGET'}
                </Text>
                <PencilSimple color={colors.textMuted} size={14} />
              </View>
              {doc.budget ? (
                <View style={{ height: 8, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: '100%', width: `${budgetPct}%`, backgroundColor: overBudget ? colors.danger : budgetPct > 80 ? colors.warning : colors.success, borderRadius: 4 }} />
                </View>
              ) : null}
              {overBudget ? (
                <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', marginTop: 6 }}>
                  {money(expense - (doc.budget ?? 0))} over budget
                </Text>
              ) : null}
            </View>
          </Pressable>
        )}
      </GlassPanel>

      <EdgeFeaturePanel
        appName="Expenses"
        accent={accent}
        headline="Money decisions, not just logs"
        caption="Turn spending data into budget coaching, accountability, and weekly finance updates."
        metrics={[
          { label: 'Balance', value: `${balance < 0 ? '-' : ''}${money(Math.abs(balance))}` },
          { label: 'Spent', value: money(expense) },
          { label: 'Budget', value: doc.budget ? `${budgetPct}%` : 'Off' },
        ]}
        prompt="Review my expense pattern and tell me where to adjust this week without making the plan unrealistic."
        shareText={`Expenses progress: income ${money(income)}, expenses ${money(expense)}, balance ${balance < 0 ? '-' : ''}${money(Math.abs(balance))}${doc.budget ? `, budget used ${budgetPct}%` : ''}.`}
        publishTitle="Budget progress"
        publishBody={`This period I logged ${money(income)} income, ${money(expense)} expenses, and a ${balance >= 0 ? 'positive' : 'negative'} balance of ${balance < 0 ? '-' : ''}${money(Math.abs(balance))}.`}
      />

      {/* Category breakdown */}
      {!searching && topCats.length > 0 && (
        <GlassPanel variant="light" borderRadius={20} contentStyle={{ padding: 18 }} style={{ marginBottom: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 12 }}>Where it went</Text>
          {topCats.map(([cat, amt]) => (
            <View key={cat} style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '600' }}>{cat}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, fontVariant: ['tabular-nums'] }}>{money(amt)}</Text>
              </View>
              <View style={{ height: 6, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)', borderRadius: 3, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${Math.max(4, Math.round((amt / maxCat) * 100))}%`, backgroundColor: colors.danger + 'AA', borderRadius: 3 }} />
              </View>
            </View>
          ))}
        </GlassPanel>
      )}

      {/* Search */}
      <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }} style={{ marginBottom: 12 }}>
        <MagnifyingGlass color={colors.textMuted} size={16} />
        <TextInput
          value={query} onChangeText={setQuery}
          placeholder="Search category or note (all months)"
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingHorizontal: 10, paddingVertical: 12 }}
        />
        {searching ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}><X color={colors.textMuted} size={15} /></Pressable>
        ) : null}
      </GlassPanel>

      {/* Filter tabs */}
      <GlassPanel variant="light" borderRadius={14} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 14 }}>
        {(['all', 'income', 'expense'] as const).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: filter === f ? (f === 'income' ? colors.success : f === 'expense' ? colors.danger : accent) : 'transparent' }}>
              <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{f}</Text>
            </View>
          </Pressable>
        ))}
      </GlassPanel>

      {/* Transactions */}
      {filtered.length === 0 && (
        <MiniEmptyState
          accent={accent}
          icon={<Wallet color={colors.textMuted} size={48} weight="duotone" />}
          title={searching ? 'No matches' : `Nothing in ${monthLabel(month)}`}
          subtitle={searching ? 'Try a different search or category.' : 'Add the first money move to see this month clearly.'}
        />
      )}

      {filtered.map((tx, i) => (
        <Animated.View key={tx.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(220)} style={{ marginBottom: 10 }}>
          <GlassPanel variant="medium" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
            <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: tx.type === 'income' ? colors.success + '18' : colors.danger + '18', borderWidth: 1, borderColor: tx.type === 'income' ? colors.success + '33' : colors.danger + '33', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>{categoryMarker(tx.category)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{tx.category}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                {tx.note ? `${tx.note} · ${formatDate(tx.date)}` : formatDate(tx.date)}
              </Text>
            </View>
            <Text style={{ color: tx.type === 'income' ? colors.success : colors.danger, fontSize: 17, fontWeight: '800' }}>
              {tx.type === 'income' ? '+' : '-'}{money(tx.amount)}
            </Text>
            <AnimatedPressable onPress={() => deleteTx(tx.id)} scaleValue={0.85} haptic="light">
              <Trash color={colors.textMuted} size={17} />
            </AnimatedPressable>
          </GlassPanel>
        </Animated.View>
      ))}

      {showAdd && <AddModal currency={doc.currency} onAdd={addTx} onClose={() => setShowAdd(false)} />}
      {showBudget && <BudgetModal budget={doc.budget} currency={doc.currency} onSave={b => update({ ...doc, budget: b })} onClose={() => setShowBudget(false)} />}
      {showCurrency && <CurrencyModal value={doc.currency} onSelect={currency => update({ ...doc, currency })} onClose={() => setShowCurrency(false)} />}
    </MiniAppShell>
  );
}
