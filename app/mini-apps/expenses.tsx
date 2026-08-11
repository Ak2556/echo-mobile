import React, { useState } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet, Share, ScrollView, ActionSheetIOS
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp, Layout } from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Plus, Wallet, ArrowUp, ArrowDown, Trash, X, CaretLeft, CaretRight, Export, PencilSimple, MagnifyingGlass, Gauge, Target, CalendarCheck, TrendUp, TrendDown, Receipt, Users, FileText, ChartPieSlice, UserCircle, HandCoins } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { useI18n } from '../../lib/i18n';
import { showToast } from '../../components/ui/Toast';
import { CURRENCIES, formatPrice, getCurrencySymbol, type CurrencyCode } from '../../lib/currency';
import {
  DEFAULT_EXPENSE_CURRENCY, EXPENSE_CATS, INCOME_CATS, ExpensesDoc, Transaction, TxType, categoryMarker, Party, PartyType,
  currentMonthKey, formatDate, loadExpensesDoc, monthKey, monthLabel,
  saveExpensesDoc, shiftMonth, transactionsToCsv, pnlToCsv,
} from '../../lib/expenses';

function AddModal({ currency, parties, onAdd, onClose }: { currency: CurrencyCode; parties: Party[]; onAdd: (tx: Transaction, newParty?: Party) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const { tt } = useI18n();
  const insets = useSafeAreaInsets();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const [partyId, setPartyId] = useState<string>('');
  const [newPartyName, setNewPartyName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  
  const isKhata = type === 'sale' || type === 'purchase' || type === 'receipt' || type === 'payment';
  const cats = (type === 'expense' || type === 'purchase' || type === 'payment') ? EXPENSE_CATS : INCOME_CATS;
  const ACCENT = (type === 'expense' || type === 'purchase' || type === 'payment') ? colors.danger : colors.success;

  const submit = () => {
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!num || num <= 0) { showToast(tt('Enter a valid amount'), tt('Error')); return; }
    if (!category && !isKhata) { showToast(tt('Pick a category'), tt('Required')); return; }
    
    let createdParty: Party | undefined;
    let finalPartyId = partyId;
    if (newPartyName.trim()) {
      createdParty = { id: Date.now().toString(), name: newPartyName.trim(), type: (type === 'sale' || type === 'receipt') ? 'customer' : 'supplier' };
      finalPartyId = createdParty.id;
    }

    onAdd({ 
      id: Date.now().toString(), 
      type, 
      amount: num, 
      category: category || type, 
      note: note.trim(), 
      date: new Date().toISOString(),
      partyId: finalPartyId || undefined,
      invoiceNo: invoiceNo.trim() || undefined,
      taxAmount: parseFloat(taxAmount) || undefined
    }, createdParty);
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{tt('Add Entry')}</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: insets.bottom + 40 }} showsVerticalScrollIndicator={false}>
          {/* Tally Type toggle (2x3 Grid) */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('ENTRY TYPE')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {(['expense', 'income', 'sale', 'receipt', 'purchase', 'payment'] as TxType[]).map(t => (
                <Pressable key={t} onPress={() => { setType(t); setCategory(''); setPartyId(''); setNewPartyName(''); }} style={{ width: '48%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: type === t ? (t === 'expense' || t === 'purchase' || t === 'payment' ? colors.danger : colors.success) : colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderWidth: type === t ? 0 : StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                  <Text style={{ color: type === t ? '#fff' : colors.text, fontWeight: '800', fontSize: 14, textTransform: 'capitalize' }}>
                    {t === 'expense' ? tt('Expense') : t === 'income' ? tt('Income') : t === 'sale' ? tt('Sale Invoice') : t === 'receipt' ? tt('Payment In') : t === 'purchase' ? tt('Purchase Bill') : tt('Payment Out')}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Amount */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('AMOUNT')}</Text>
            <GlassPanel variant="medium" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }} style={{ borderColor: ACCENT + '44' }}>
              <Text style={{ color: ACCENT, fontSize: 22, fontWeight: '900', marginRight: 8 }}>{getCurrencySymbol(currency)}</Text>
              <TextInput value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" autoFocus style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 14 }} />
            </GlassPanel>
          </View>

          {/* Party Selection (Khata) */}
          {isKhata && (
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('PARTY / LEDGER')}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
                {parties.filter(p => (type === 'sale' || type === 'receipt') ? p.type === 'customer' : p.type === 'supplier').map(p => (
                  <Pressable key={p.id} onPress={() => { setPartyId(p.id); setNewPartyName(''); }}>
                    <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: partyId === p.id ? ACCENT + '22' : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'), borderWidth: partyId === p.id ? 1.5 : StyleSheet.hairlineWidth, borderColor: partyId === p.id ? ACCENT : colors.glassBorder }}>
                      <Text style={{ color: partyId === p.id ? ACCENT : colors.text, fontWeight: '700', fontSize: 13 }}>{p.name}</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
              {!partyId && (
                <TextInput value={newPartyName} onChangeText={setNewPartyName} placeholder={tt('Or enter new party name')} placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
              )}
            </View>
          )}

          {/* Invoice & Tax */}
          {(type === 'sale' || type === 'purchase') && (
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('INVOICE NO')}</Text>
                <TextInput value={invoiceNo} onChangeText={setInvoiceNo} placeholder="INV-001" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('GST / TAX')}</Text>
                <TextInput value={taxAmount} onChangeText={setTaxAmount} placeholder="0.00" keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
              </View>
            </View>
          )}

          {/* Category */}
          {!isKhata && (
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>{tt('CATEGORY')}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {cats.map(c => (
                  <Pressable key={c.label} onPress={() => setCategory(c.label)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: category === c.label ? ACCENT + '22' : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'), borderWidth: category === c.label ? 1.5 : StyleSheet.hairlineWidth, borderColor: category === c.label ? ACCENT : colors.glassBorder }}>
                      <Text style={{ color: category === c.label ? ACCENT : colors.textMuted, fontSize: 11, fontWeight: '800' }}>{c.marker}</Text>
                      <Text style={{ color: category === c.label ? ACCENT : colors.text, fontWeight: '600', fontSize: 13 }}>{tt(c.label)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Note */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>{tt('NOTE (optional)')}</Text>
            <TextInput value={note} onChangeText={setNote} placeholder={tt('What was this for?')} placeholderTextColor={colors.textMuted} style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 16, paddingVertical: 14 }} />
          </View>

          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{tt('Save Entry')}</Text>
          </AnimatedPressable>
        </ScrollView>
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

// Removed MoneyPulsePanel for a cleaner, larger-scale layout

function BudgetModal({ budget, currency, onSave, onClose }: { budget: number | null; currency: CurrencyCode; onSave: (b: number | null) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const { tt } = useI18n();
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
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{tt('Monthly Budget')}</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <View style={{ padding: 20, gap: 20 }}>
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            {tt('How much do you plan to spend per month? Leave empty to remove the budget.')}
          </Text>
          <GlassPanel variant="medium" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }}>
            <Text style={{ color: colors.accent, fontSize: 22, fontWeight: '900', marginRight: 8 }}>{getCurrencySymbol(currency)}</Text>
            <TextInput value={value} onChangeText={setValue} placeholder="1500" placeholderTextColor={colors.textMuted} keyboardType="decimal-pad" autoFocus style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 14 }} />
          </GlassPanel>
          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{ backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 16, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{tt('Save Budget')}</Text>
          </AnimatedPressable>
        </View>
      </View>
    </Modal>
  );
}

function CurrencyModal({ value, onSelect, onClose }: { value: CurrencyCode; onSelect: (currency: CurrencyCode) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const { tt } = useI18n();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = CURRENCIES.filter(currency => !q || `${currency.code} ${currency.label}`.toLowerCase().includes(q));
  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{tt('Currency')}</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light"><X color={colors.textMuted} size={22} /></AnimatedPressable>
        </View>
        <View style={{ padding: 20, gap: 14, flex: 1 }}>
          <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={tt('Search USD, INR, Euro, Yen...')}
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
  const { tt } = useI18n();
  const accent = '#8B6F4E'; // caramel — warm editorial palette
  const [doc, setDoc] = useState<ExpensesDoc>({ txs: [], parties: [], budget: null, currency: DEFAULT_EXPENSE_CURRENCY });
  const [activeTab, setActiveTab] = useState<'dashboard' | 'parties'>('dashboard');
  const { vAction, vValue } = useLocalSearchParams<{ vAction?: string; vValue?: string }>();
  const didVoiceRef = React.useRef(false);
  useFocusEffect(
    React.useCallback(() => {
      loadExpensesDoc().then((loaded) => {
        // Voice: "add expense 500 food" / "खर्च जोड़ो 500 खाना" → ?vAction=add&vValue=…
        const a = typeof vAction === 'string' ? vAction.toLowerCase() : '';
        const text = typeof vValue === 'string' ? vValue.trim() : '';
        const numMatch = text.match(/\d[\d,.]*/);
        const amount = numMatch ? parseFloat(numMatch[0].replace(/,/g, '')) : 0;
        if (!didVoiceRef.current && a === 'add' && amount > 0) {
          didVoiceRef.current = true;
          const lower = text.toLowerCase();
          const isIncome = /\bincome|salary|freelance|gift\b|आय|वेतन|सैलरी|कमाई/.test(lower);
          const cats = isIncome ? INCOME_CATS : EXPENSE_CATS;
          const category = cats.find(c => lower.includes(c.label.toLowerCase()))?.label ?? 'Other';
          const note = text
            .replace(numMatch![0], '')
            .replace(new RegExp(category, 'i'), '')
            .replace(/\b(rupees?|rs|rupaye|dollars?)\b|रुपये|रुपए|रुपया/gi, '')
            .trim();
          const tx: Transaction = {
            id: Date.now().toString(), type: isIncome ? 'income' : 'expense',
            amount, category, note, date: new Date().toISOString(),
          };
          const next: ExpensesDoc = { ...loaded, txs: [tx, ...loaded.txs] };
          setDoc(next);
          void saveExpensesDoc(next);
          showToast(`${isIncome ? 'Income' : 'Expense'} added`, 'Saved');
        } else {
          setDoc(loaded);
        }
      });
    }, [vAction, vValue]),
  );
  const [showAdd, setShowAdd] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [showCurrency, setShowCurrency] = useState(false);
  const [filter, setFilter] = useState<'all' | TxType>('all');
  const [month, setMonth] = useState(currentMonthKey());
  const [query, setQuery] = useState('');
  const money = (amount: number) => formatPrice(amount, doc.currency);

  const txs = doc.txs || [];
  const parties = doc.parties || [];
  const searching = query.trim().length > 0;
  const q = query.trim().toLowerCase();
  const inScope = searching
    ? txs.filter(t => t.category.toLowerCase().includes(q) || t.note.toLowerCase().includes(q) || parties.find(p => p.id === t.partyId)?.name.toLowerCase().includes(q))
    : txs.filter(t => monthKey(t.date) === month);

  // Profit & Loss calculation including Khata logic
  const income = inScope.filter(t => t.type === 'income' || t.type === 'sale').reduce((s, t) => s + t.amount, 0);
  const expense = inScope.filter(t => t.type === 'expense' || t.type === 'purchase').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;
  const filtered = filter === 'all' ? inScope : inScope.filter(t => t.type === filter || (filter === 'income' && t.type === 'sale') || (filter === 'expense' && t.type === 'purchase'));

  const budgetPct = doc.budget ? Math.min(100, Math.round((expense / doc.budget) * 100)) : 0;
  const overBudget = doc.budget != null && expense > doc.budget;

  const catTotals = new Map<string, number>();
  for (const t of inScope) if (t.type === 'expense') catTotals.set(t.category, (catTotals.get(t.category) ?? 0) + t.amount);
  const topCats = [...catTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = topCats[0]?.[1] ?? 1;

  const update = (next: ExpensesDoc) => { setDoc(next); saveExpensesDoc(next); };

  const addTx = (tx: Transaction, newParty?: Party) => {
    const nextParties = newParty ? [newParty, ...parties] : parties;
    update({ ...doc, txs: [tx, ...txs], parties: nextParties });
    setMonth(monthKey(tx.date));
    showToast(tt('Entry added successfully'), tt('Saved'));
  };

  const deleteTx = (id: string) => {
    Alert.alert(tt('Delete?'), tt('Remove this transaction?'), [
      { text: tt('Cancel'), style: 'cancel' },
      { text: tt('Delete'), style: 'destructive', onPress: () => update({ ...doc, txs: txs.filter(t => t.id !== id) }) },
    ]);
  };

  const handleExport = () => {
    if (txs.length === 0) { showToast(tt('Nothing to export yet'), tt('Export')); return; }
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: [tt('Cancel'), tt('Export P&L Summary'), tt('Export All Transactions (CSV)')],
        cancelButtonIndex: 0,
      },
      async (buttonIndex) => {
        if (buttonIndex === 1 || buttonIndex === 2) {
          const csv = buttonIndex === 1 ? pnlToCsv(txs) : transactionsToCsv(txs);
          const filename = buttonIndex === 1 ? 'echo-pnl-summary.csv' : 'echo-expenses-raw.csv';
          try {
            const path = `${FS.cacheDirectory}${filename}`;
            await FS.writeAsStringAsync(path, csv);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: tt('Export Khata') });
              return;
            }
            throw new Error('sharing unavailable');
          } catch {
            Share.share({ message: csv }).catch(() => {});
          }
        }
      }
    );
  };

  const HeaderBtns = (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      <AnimatedPressable onPress={() => setShowCurrency(true)} scaleValue={0.88} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12, paddingHorizontal: 11, paddingVertical: 10 }}>
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '900' }}>{doc.currency}</Text>
      </AnimatedPressable>
      <AnimatedPressable onPress={handleExport} scaleValue={0.88} haptic="light" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12 }}>
        <Export color={colors.text} size={18} weight="bold" />
      </AnimatedPressable>
    </View>
  );

  return (
    <MiniAppShell title={tt('Khata')} subtitle={tt('Accounting')} scrollable={false} headerRight={HeaderBtns}>
      <View style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
      {/* Top Tab Bar */}
      <GlassPanel variant="light" borderRadius={16} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 14 }}>
        <Pressable onPress={() => setActiveTab('dashboard')} style={{ flex: 1 }}>
          <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: activeTab === 'dashboard' ? colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' : 'transparent' }}>
            <Text style={{ color: activeTab === 'dashboard' ? colors.text : colors.textMuted, fontWeight: '800', fontSize: 13 }}>{tt('Dashboard')}</Text>
          </View>
        </Pressable>
        <Pressable onPress={() => setActiveTab('parties')} style={{ flex: 1 }}>
          <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: activeTab === 'parties' ? colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)' : 'transparent' }}>
            <Text style={{ color: activeTab === 'parties' ? colors.text : colors.textMuted, fontWeight: '800', fontSize: 13 }}>{tt('Parties & Ledgers')}</Text>
          </View>
        </Pressable>
      </GlassPanel>

      {activeTab === 'parties' && (
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800' }}>{tt('Directory')}</Text>
          </View>
          {parties.length === 0 ? (
            <MiniEmptyState accent={accent} icon={<Users color={colors.textMuted} size={48} weight="duotone" />} title={tt('No Parties yet')} subtitle={tt('Add a transaction and create a customer or supplier to see their ledger.')} />
          ) : (
            parties.map(party => {
              // Calculate party balance: (Sales + Receipts) vs (Purchases + Payments)
              // Receivable = Sales - Receipts
              // Payable = Purchases - Payments
              const partyTxs = txs.filter(t => t.partyId === party.id);
              let balance = 0;
              for (const t of partyTxs) {
                if (t.type === 'sale') balance += t.amount;
                if (t.type === 'receipt') balance -= t.amount;
                if (t.type === 'purchase') balance -= t.amount; // payable
                if (t.type === 'payment') balance += t.amount; // reduces payable
              }
              const isReceivable = balance > 0;
              const isSettled = balance === 0;
              
              return (
                <GlassPanel key={party.id} variant="medium" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }} style={{ marginBottom: 10 }}>
                  <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: party.type === 'customer' ? colors.success + '22' : colors.warning + '22', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: party.type === 'customer' ? colors.success : colors.warning, fontSize: 16, fontWeight: '900' }}>{party.name.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{party.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{party.type === 'customer' ? tt('Customer') : tt('Supplier')} · {partyTxs.length} {tt('entries')}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: isSettled ? colors.textMuted : isReceivable ? colors.success : colors.danger, fontSize: 16, fontWeight: '900' }}>
                      {money(Math.abs(balance))}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
                      {isSettled ? tt('Settled') : isReceivable ? tt('You will get') : tt('You will give')}
                    </Text>
                  </View>
                </GlassPanel>
              );
            })
          )}
        </View>
      )}

      {activeTab === 'dashboard' && (
        <Animated.View entering={FadeInUp.duration(300)}>
          {/* Main Fintech Balance Card */}
          <View style={{ marginBottom: 24, marginHorizontal: 2 }}>
            <LinearGradient
              colors={balance >= 0 ? ['#054F31', '#022C1A'] : ['#7F1D1D', '#450a0a']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={{ borderRadius: 28, padding: 24, paddingBottom: 28, shadowColor: balance >= 0 ? colors.success : colors.danger, shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}
            >
              <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 }}>
                {searching ? tt('Matching P&L') : `${tt('Net')} ${balance >= 0 ? tt('Profit') : tt('Loss')} · ${doc.currency}`}
              </Text>
              <Text style={{ color: '#fff', fontSize: 48, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1.5 }}>
                {balance < 0 ? '-' : ''}{money(Math.abs(balance))}
              </Text>
              
              <View style={{ flexDirection: 'row', marginTop: 32, gap: 16 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ArrowDown color="rgba(255,255,255,0.9)" size={14} weight="bold" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{tt('TOTAL INCOME')}</Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{money(income)}</Text>
                </View>
                <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)' }} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <ArrowUp color="rgba(255,255,255,0.9)" size={14} weight="bold" />
                    <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{tt('TOTAL SPEND')}</Text>
                  </View>
                  <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>{money(expense)}</Text>
                </View>
              </View>
            </LinearGradient>
          </View>

          {/* Search */}
          <GlassPanel variant="light" borderRadius={20} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 }} style={{ marginBottom: 18 }}>
            <MagnifyingGlass color={colors.textMuted} size={18} />
            <TextInput
              value={query} onChangeText={setQuery}
              placeholder={tt('Search entries...')}
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 16, paddingHorizontal: 12, paddingVertical: 16, fontWeight: '500' }}
            />
            {searching ? (
              <Pressable onPress={() => setQuery('')} hitSlop={8}><X color={colors.textMuted} size={18} /></Pressable>
            ) : null}
          </GlassPanel>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, paddingHorizontal: 4 }}>
            <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.2 }}>{tt('Recent Activity')}</Text>
          </View>





      {/* Filter tabs */}
      <GlassPanel variant="light" borderRadius={14} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 14 }}>
        {(['all', 'income', 'expense'] as const).map(f => (
          <Pressable key={f} onPress={() => setFilter(f)} style={{ flex: 1 }}>
            <View style={{ paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: filter === f ? (f === 'income' ? colors.success : f === 'expense' ? colors.danger : accent) : 'transparent' }}>
              <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>
                {f === 'income' ? tt('Got') : f === 'expense' ? tt('Gave') : tt('All')}
              </Text>
            </View>
          </Pressable>
        ))}
      </GlassPanel>

      {/* Transactions */}
      {filtered.length === 0 && (
        <MiniEmptyState
          accent={accent}
          icon={<Wallet color={colors.textMuted} size={48} weight="duotone" />}
          title={searching ? tt('No matches') : `${tt('Nothing in')} ${monthLabel(month)}`}
          subtitle={searching ? tt('Try a different search or category.') : tt('Add the first money move to see this month clearly.')}
        />
      )}

      {filtered.map((tx, i) => {
        const p = parties.find(p => p.id === tx.partyId);
        const title = p ? p.name : tx.category;
        const iconColor = (tx.type === 'income' || tx.type === 'sale' || tx.type === 'receipt') ? colors.success : colors.danger;
        return (
          <Animated.View key={tx.id} entering={FadeInDown.delay(Math.min(i, 8) * 40).duration(220)} style={{ marginBottom: 10 }}>
            <GlassPanel variant="medium" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
              <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: iconColor + '18', borderWidth: 1, borderColor: iconColor + '33', alignItems: 'center', justifyContent: 'center' }}>
                {tx.invoiceNo ? <FileText color={iconColor} size={20} weight="fill" /> : <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '800' }}>{categoryMarker(tx.category)}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{tt(title)}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {tx.type.toUpperCase()} {tx.invoiceNo ? `· ${tx.invoiceNo}` : ''} {tx.note ? `· ${tx.note}` : ''}
                </Text>
              </View>
              <Text style={{ color: iconColor, fontSize: 17, fontWeight: '800' }}>
                {iconColor === colors.success ? '+' : '-'}{money(tx.amount)}
              </Text>
              <AnimatedPressable onPress={() => deleteTx(tx.id)} scaleValue={0.85} haptic="light">
                <Trash color={colors.textMuted} size={17} />
              </AnimatedPressable>
            </GlassPanel>
          </Animated.View>
        );
      })}

      </Animated.View>
      )}
      </ScrollView>

      {/* Floating Bottom Navigation & FAB */}
      <View style={{ position: 'absolute', bottom: 32, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', pointerEvents: 'box-none' }}>
        <View style={{ flex: 1, alignItems: 'center', pointerEvents: 'box-none' }}>
          <View style={{ flexDirection: 'row', backgroundColor: colors.isDark ? 'rgba(40,40,40,0.85)' : 'rgba(255,255,255,0.9)', borderRadius: 100, padding: 6, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } }}>
            <Pressable onPress={() => setActiveTab('dashboard')} style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, backgroundColor: activeTab === 'dashboard' ? (colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)') : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <ChartPieSlice color={activeTab === 'dashboard' ? colors.text : colors.textMuted} size={20} weight={activeTab === 'dashboard' ? 'fill' : 'regular'} />
              {activeTab === 'dashboard' && <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{tt('Dashboard')}</Text>}
            </Pressable>
            <Pressable onPress={() => setActiveTab('parties')} style={{ paddingHorizontal: 20, paddingVertical: 12, borderRadius: 100, backgroundColor: activeTab === 'parties' ? (colors.isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.06)') : 'transparent', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Users color={activeTab === 'parties' ? colors.text : colors.textMuted} size={20} weight={activeTab === 'parties' ? 'fill' : 'regular'} />
              {activeTab === 'parties' && <Text style={{ color: colors.text, fontWeight: '800', fontSize: 14 }}>{tt('Parties')}</Text>}
            </Pressable>
          </View>
        </View>
        <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.9} haptic="medium" style={{ position: 'absolute', right: 0, width: 64, height: 64, borderRadius: 32, backgroundColor: accent, alignItems: 'center', justifyContent: 'center', shadowColor: accent, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } }}>
          <Plus color="#fff" size={28} weight="bold" />
        </AnimatedPressable>
      </View>
      </View>

      {showAdd && <AddModal currency={doc.currency} parties={parties} onAdd={addTx} onClose={() => setShowAdd(false)} />}
      {showBudget && <BudgetModal budget={doc.budget} currency={doc.currency} onSave={b => update({ ...doc, budget: b })} onClose={() => setShowBudget(false)} />}
      {showCurrency && <CurrencyModal value={doc.currency} onSelect={currency => update({ ...doc, currency })} onClose={() => setShowCurrency(false)} />}
    </MiniAppShell>
  );
}
