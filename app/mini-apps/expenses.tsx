import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ArrowLeft, Plus, Wallet, ArrowUp, ArrowDown, Trash, X,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { showToast } from '../../components/ui/Toast';

const TX_KEY = 'mini:expenses';

type TxType = 'income' | 'expense';

interface Transaction {
  id: string;
  type: TxType;
  amount: number;
  category: string;
  note: string;
  date: string;
}

const EXPENSE_CATS = [
  { label: 'Food', emoji: '🍔' },
  { label: 'Transport', emoji: '🚗' },
  { label: 'Shopping', emoji: '🛍' },
  { label: 'Health', emoji: '💊' },
  { label: 'Bills', emoji: '📱' },
  { label: 'Entertainment', emoji: '🎮' },
  { label: 'Travel', emoji: '✈️' },
  { label: 'Other', emoji: '📦' },
];
const INCOME_CATS = [
  { label: 'Salary', emoji: '💼' },
  { label: 'Freelance', emoji: '💻' },
  { label: 'Gift', emoji: '🎁' },
  { label: 'Investment', emoji: '📈' },
  { label: 'Other', emoji: '💰' },
];

async function load(): Promise<Transaction[]> {
  try { return JSON.parse((await AsyncStorage.getItem(TX_KEY)) ?? '[]'); } catch { return []; }
}
function save(txs: Transaction[]) { AsyncStorage.setItem(TX_KEY, JSON.stringify(txs)); }

function formatMoney(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function AddModal({ onAdd, onClose }: { onAdd: (tx: Transaction) => void; onClose: () => void }) {
  const { colors } = useTheme();
  const [type, setType] = useState<TxType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [note, setNote] = useState('');
  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS;

  const ACCENT = type === 'expense' ? '#EF4444' : '#10B981';

  const submit = () => {
    const num = parseFloat(amount.replace(/,/g, ''));
    if (!num || num <= 0) { showToast('Enter a valid amount', '⚠️'); return; }
    if (!category) { showToast('Pick a category', '⚠️'); return; }
    onAdd({
      id: Date.now().toString(),
      type, amount: num, category, note: note.trim(),
      date: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>Add Transaction</Text>
          <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light">
            <X color={colors.textMuted} size={22} />
          </AnimatedPressable>
        </View>

        <ScrollView contentContainerStyle={{ padding: 20, gap: 22 }} keyboardShouldPersistTaps="handled">
          {/* Type toggle */}
          <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border }}>
            {(['expense', 'income'] as TxType[]).map(t => (
              <Pressable key={t} onPress={() => { setType(t); setCategory(''); }} style={{
                flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
                backgroundColor: type === t ? (t === 'expense' ? '#EF4444' : '#10B981') : 'transparent',
              }}>
                <Text style={{ color: type === t ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 14, textTransform: 'capitalize' }}>{t}</Text>
              </Pressable>
            ))}
          </View>

          {/* Amount */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>AMOUNT</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1.5, borderColor: ACCENT + '44', paddingHorizontal: 16 }}>
              <Text style={{ color: ACCENT, fontSize: 22, fontWeight: '900', marginRight: 8 }}>$</Text>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '800', paddingVertical: 14 }}
              />
            </View>
          </View>

          {/* Category */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 10 }}>CATEGORY</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {cats.map(c => (
                <Pressable key={c.label} onPress={() => setCategory(c.label)}>
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', gap: 7,
                    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
                    backgroundColor: category === c.label ? ACCENT + '22' : colors.surface,
                    borderWidth: 1.5, borderColor: category === c.label ? ACCENT : colors.border,
                  }}>
                    <Text style={{ fontSize: 16 }}>{c.emoji}</Text>
                    <Text style={{ color: category === c.label ? ACCENT : colors.text, fontWeight: '600', fontSize: 13 }}>{c.label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Note */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8 }}>NOTE (optional)</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="What was this for?"
              placeholderTextColor={colors.textMuted}
              style={{ color: colors.text, fontSize: 15, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 14 }}
            />
          </View>

          <AnimatedPressable onPress={submit} scaleValue={0.96} haptic="medium" style={{
            backgroundColor: ACCENT, borderRadius: 16, paddingVertical: 16, alignItems: 'center',
            shadowColor: ACCENT, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
          }}>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Add {type === 'expense' ? 'Expense' : 'Income'}</Text>
          </AnimatedPressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

export default function ExpensesApp() {
  const { colors } = useTheme();
  const router = useRouter();
  const [txs, setTxs] = useState<Transaction[]>([]);
  useEffect(() => { load().then(setTxs); }, []);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | TxType>('all');

  const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const balance = income - expense;

  const filtered = filter === 'all' ? txs : txs.filter(t => t.type === filter);

  const addTx = (tx: Transaction) => {
    const updated = [tx, ...txs];
    setTxs(updated);
    save(updated);
    showToast(`${tx.type === 'expense' ? 'Expense' : 'Income'} added`, tx.type === 'expense' ? '📉' : '📈');
  };

  const deleteTx = (id: string) => {
    Alert.alert('Delete?', 'Remove this transaction?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: () => {
          const updated = txs.filter(t => t.id !== id);
          setTxs(updated);
          save(updated);
        },
      },
    ]);
  };

  const catEmoji = (cat: string) => {
    return [...EXPENSE_CATS, ...INCOME_CATS].find(c => c.label === cat)?.emoji ?? '💰';
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
        <AnimatedPressable onPress={() => router.back()} scaleValue={0.88} haptic="light" style={{ marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', flex: 1 }}>Expenses</Text>
        <AnimatedPressable onPress={() => setShowAdd(true)} scaleValue={0.88} haptic="medium" style={{ backgroundColor: '#10B981', borderRadius: 12, padding: 10 }}>
          <Plus color="#fff" size={18} weight="bold" />
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <Animated.View entering={FadeInDown.springify()} style={{
          backgroundColor: colors.surface, borderRadius: 28, padding: 24,
          borderWidth: 1, borderColor: colors.border,
          shadowColor: balance >= 0 ? '#10B981' : '#EF4444',
          shadowOpacity: 0.15, shadowRadius: 20, shadowOffset: { width: 0, height: 4 },
        }}>
          <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>Balance</Text>
          <Text style={{ color: balance >= 0 ? '#10B981' : '#EF4444', fontSize: 40, fontWeight: '900', letterSpacing: -1 }}>
            {balance < 0 ? '-' : ''}${formatMoney(Math.abs(balance))}
          </Text>

          <View style={{ flexDirection: 'row', marginTop: 20, gap: 12 }}>
            {/* Income */}
            <View style={{ flex: 1, backgroundColor: '#10B98118', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#10B98133' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <ArrowDown color="#10B981" size={14} weight="bold" />
                <Text style={{ color: '#10B981', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>INCOME</Text>
              </View>
              <Text style={{ color: '#10B981', fontSize: 20, fontWeight: '800' }}>${formatMoney(income)}</Text>
            </View>

            {/* Expense */}
            <View style={{ flex: 1, backgroundColor: '#EF444418', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#EF444433' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <ArrowUp color="#EF4444" size={14} weight="bold" />
                <Text style={{ color: '#EF4444', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>EXPENSES</Text>
              </View>
              <Text style={{ color: '#EF4444', fontSize: 20, fontWeight: '800' }}>${formatMoney(expense)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Filter tabs */}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, padding: 4, borderWidth: 1, borderColor: colors.border }}>
          {(['all', 'income', 'expense'] as const).map(f => (
            <Pressable key={f} onPress={() => setFilter(f)} style={{
              flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
              backgroundColor: filter === f ? (f === 'income' ? '#10B981' : f === 'expense' ? '#EF4444' : '#6366F1') : 'transparent',
            }}>
              <Text style={{ color: filter === f ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{f}</Text>
            </Pressable>
          ))}
        </View>

        {/* Transaction list */}
        {filtered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 12 }}>
            <Wallet color={colors.border} size={48} weight="thin" />
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>No transactions yet</Text>
          </View>
        )}

        {filtered.map((tx, i) => (
          <Animated.View key={tx.id} entering={FadeInDown.delay(i * 40).springify()}>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 14 }}>
              {/* Category icon */}
              <View style={{
                width: 48, height: 48, borderRadius: 14,
                backgroundColor: tx.type === 'income' ? '#10B98118' : '#EF444418',
                borderWidth: 1, borderColor: tx.type === 'income' ? '#10B98133' : '#EF444433',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{ fontSize: 22 }}>{catEmoji(tx.category)}</Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{tx.category}</Text>
                {tx.note ? (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{tx.note}</Text>
                ) : (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{formatDate(tx.date)}</Text>
                )}
              </View>

              <Text style={{ color: tx.type === 'income' ? '#10B981' : '#EF4444', fontSize: 17, fontWeight: '800' }}>
                {tx.type === 'income' ? '+' : '-'}${formatMoney(tx.amount)}
              </Text>

              <AnimatedPressable onPress={() => deleteTx(tx.id)} scaleValue={0.85} haptic="light">
                <Trash color={colors.textMuted} size={17} />
              </AnimatedPressable>
            </View>
          </Animated.View>
        ))}
      </ScrollView>

      {showAdd && <AddModal onAdd={addTx} onClose={() => setShowAdd(false)} />}
    </SafeAreaView>
  );
}
