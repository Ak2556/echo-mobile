import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Alert, Modal, StyleSheet, ScrollView, Switch, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useFocusEffect } from 'expo-router';
import Svg, { Circle, Polyline } from 'react-native-svg';
import { Plus, Barbell, ForkKnife, TrendUp, Trash, X, CaretDown, CaretUp, PencilSimple, MagnifyingGlass, Drop, Minus, Play, Fire, FloppyDisk, GearSix, Star, ClockCounterClockwise, Globe } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck, MiniEmptyState } from '../../components/mini-apps/MiniKit';
import { ExerciseDemo } from '../../components/mini-apps/ExerciseDemo';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import {
  FitnessDoc, Meal, MealKind, MEAL_KINDS, Workout, WorkoutExercise, WeightEntry,
  MeasurementEntry, MEASUREMENT_FIELDS, Routine, CustomFood,
  FitnessSettings, FitnessGoals, Sex, ActivityLevel, GoalType, ACTIVITY_LABELS, computeTargets,
  loadFitness, saveFitness, todayMealTotals, todayWaterMl, workoutVolume, isSameDay,
  liftHistory, est1RM, weeklySummaries, monthlySummaries,
  thisWeekWorkoutCount, weeklyStreak, detectPRs,
} from '../../lib/fitness';
import { syncFitnessReminders } from '../../lib/fitnessReminders';
import { WorkoutSession } from '../../components/mini-apps/WorkoutSession';
import { EXERCISES, EXERCISE_CATALOG, MUSCLE_GROUPS, MuscleGroup, searchExercises } from '../../lib/exerciseLibrary';
import { FoodItem, FOOD_GROUPS, FoodGroupId, foodsForGroup, searchFoods, foodById } from '../../lib/foodDatabase';
import { searchOnlineFoods } from '../../lib/foodApi';

const TEAL = '#4E8B7A'; // sage — warm editorial palette
type Tab = 'meals' | 'workouts' | 'progress' | 'library';

const TABS: { key: Tab; label: string }[] = [
  { key: 'meals', label: 'Meals' },
  { key: 'workouts', label: 'Workouts' },
  { key: 'progress', label: 'Progress' },
  { key: 'library', label: 'Library' },
];

function num(v: string): number {
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function SheetHeader({ title, onClose }: { title: string; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
      <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', flex: 1 }}>{title}</Text>
      <AnimatedPressable onPress={onClose} scaleValue={0.9} haptic="light" accessibilityRole="button" accessibilityLabel={`Close ${title}`}><X color={colors.textMuted} size={22} /></AnimatedPressable>
    </View>
  );
}

function Field({ label, value, onChange, placeholder, keyboard = 'default', flex = 1, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
  keyboard?: 'default' | 'decimal-pad'; flex?: number; autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{label}</Text>
      <TextInput
        value={value} onChangeText={onChange} placeholder={placeholder} autoFocus={autoFocus}
        placeholderTextColor={colors.textMuted} keyboardType={keyboard}
        style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, paddingVertical: 12 }}
      />
    </View>
  );
}

function SubmitBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <AnimatedPressable onPress={onPress} scaleValue={0.96} haptic="medium" style={{ backgroundColor: TEAL, borderRadius: 16, paddingVertical: 16, alignItems: 'center', shadowColor: TEAL, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>{label}</Text>
    </AnimatedPressable>
  );
}

// ── Add meal ─────────────────────────────────────────────────────────────────

function FoodRow({ food, fav, onTap, onStar }: { food: FoodItem; fav: boolean; onTap: () => void; onStar: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
      <Pressable onPress={onTap} style={{ flex: 1, minWidth: 0 }} accessibilityRole="button" accessibilityLabel={`Add ${food.name}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '600', flexShrink: 1 }} numberOfLines={1}>{food.name}</Text>
          {food.tags?.includes('online') ? <Globe color={colors.textMuted} size={12} weight="bold" /> : null}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>{food.serving} · P {food.protein}g · C {food.carbs}g · F {food.fat}g</Text>
        {(food.fiber != null || food.sugar != null || food.sodium != null) ? (
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
            {[food.fiber != null ? `Fiber ${food.fiber}g` : null, food.sugar != null ? `Sugar ${food.sugar}g` : null, food.sodium != null ? `Na ${food.sodium}mg` : null].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </Pressable>
      <Text style={{ color: TEAL, fontSize: 14, fontWeight: '800', marginRight: 12 }}>{food.calories} kcal</Text>
      <Pressable onPress={onStar} hitSlop={8} accessibilityRole="button" accessibilityLabel={fav ? `Unfavorite ${food.name}` : `Favorite ${food.name}`}>
        <Star color={fav ? '#E8A93E' : colors.textMuted} size={18} weight={fav ? 'fill' : 'regular'} />
      </Pressable>
    </View>
  );
}

function AddMealModal({ customFoods, recentMeals, favoriteIds, onToggleFavorite, onAdd, onSaveFood, onClose }: {
  customFoods: CustomFood[];
  recentMeals: Meal[];
  favoriteIds: string[];
  onToggleFavorite: (id: string) => void;
  onAdd: (m: Meal) => void;
  onSaveFood: (f: CustomFood) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MealKind>('breakfast');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');
  const [search, setSearch] = useState('');
  const [activeFoodGroup, setActiveFoodGroup] = useState<FoodGroupId>('quick');
  const [picked, setPicked] = useState<FoodItem | null>(null);
  const [qty, setQty] = useState(1);
  const [saveToFoods, setSaveToFoods] = useState(false);
  const [fiber, setFiber] = useState('');
  const [sugar, setSugar] = useState('');
  const [sodium, setSodium] = useState('');
  const [note, setNote] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [online, setOnline] = useState<FoodItem[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [mealDate, setMealDate] = useState(todayIso);
  const [mealTime, setMealTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  // The last 7 calendar days as quick day-picker chips.
  const dayOptions = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
    return { iso, label };
  });
  // Your foods rank above the built-in database.
  const q = search.trim().toLowerCase();
  const customHits: FoodItem[] = q
    ? customFoods.filter(f => `${f.name} ${f.serving}`.toLowerCase().includes(q)).slice(0, 6)
    : activeFoodGroup === 'quick' ? customFoods.slice(0, 4) : [];
  const builtInHits = q ? searchFoods(search, 18) : foodsForGroup(activeFoodGroup, 16);
  const localHits = [...customHits, ...builtInHits.filter(f => !customHits.some(c => c.id === f.id))];
  // One unified list: your foods + built-in catalog first, then online (Open
  // Food Facts) results filling the tail, de-duped by name so a curated match
  // always wins over the crowd-sourced one.
  const localNames = new Set(localHits.map(f => f.name.trim().toLowerCase()));
  const onlineExtra = q ? online.filter(f => !localNames.has(f.name.trim().toLowerCase())) : [];
  const results = picked ? [] : [...localHits, ...onlineExtra].slice(0, 30);

  // Starred foods (from the built-in DB or your saved foods), for quick access.
  const favoriteFoods: FoodItem[] = favoriteIds
    .map(id => foodById(id) ?? customFoods.find(f => f.id === id))
    .filter((f): f is FoodItem => !!f);
  // Recently logged meals, most-recent-first and de-duped by name.
  const recentDistinct: Meal[] = (() => {
    const seen = new Set<string>();
    const out: Meal[] = [];
    for (const m of recentMeals) {
      const key = m.name.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
      if (out.length >= 6) break;
    }
    return out;
  })();
  const showQuickExtras = !picked && !q && activeFoodGroup === 'quick';

  // Online food search (Open Food Facts) — debounced, cancel-on-change.
  useEffect(() => {
    if (q.length < 3 || picked) { setOnline([]); setOnlineLoading(false); return; }
    const ctrl = new AbortController();
    setOnlineLoading(true);
    const t = setTimeout(() => {
      searchOnlineFoods(search, ctrl.signal)
        .then(setOnline)
        .finally(() => setOnlineLoading(false));
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [q, search, picked]);

  const applyFood = (food: FoodItem, q: number) => {
    setPicked(food);
    setQty(q);
    setSearch('');
    setName(q === 1 ? food.name : `${food.name} ×${q}`);
    setCalories(String(Math.round(food.calories * q)));
    setProtein(String(Math.round(food.protein * q * 10) / 10));
    setCarbs(String(Math.round(food.carbs * q * 10) / 10));
    setFat(String(Math.round(food.fat * q * 10) / 10));
    // Carry the catalog's fibre / sugar / sodium through (scaled).
    setFiber(food.fiber != null ? String(Math.round(food.fiber * q * 10) / 10) : '');
    setSugar(food.sugar != null ? String(Math.round(food.sugar * q * 10) / 10) : '');
    setSodium(food.sodium != null ? String(Math.round(food.sodium * q)) : '');
  };

  // Prefill the form from a previously logged meal (one-tap re-log).
  const applyRecent = (m: Meal) => {
    setPicked(null);
    setSearch('');
    setName(m.name);
    setKind(m.kind);
    setCalories(String(m.calories));
    setProtein(String(m.protein));
    setCarbs(String(m.carbs));
    setFat(String(m.fat));
  };

  const submit = () => {
    if (!name.trim()) { showToast('Name the meal', 'Required'); return; }
    const cal = num(calories);
    if (cal <= 0) { showToast('Enter calories', 'Required'); return; }
    if (saveToFoods && !picked) {
      onSaveFood({
        id: `custom-${Date.now()}`, name: name.trim(), serving: '1 serving',
        calories: cal, protein: num(protein), carbs: num(carbs), fat: num(fat),
      });
    }
    const time = /^\d{1,2}:\d{2}$/.test(mealTime.trim()) ? mealTime.trim().padStart(5, '0') : '12:00';
    const built = new Date(`${mealDate}T${time}:00`);
    const date = Number.isNaN(built.getTime()) ? new Date().toISOString() : built.toISOString();
    onAdd({
      id: Date.now().toString(), name: name.trim(), kind, calories: cal,
      protein: num(protein), carbs: num(carbs), fat: num(fat),
      ...(num(fiber) > 0 ? { fiber: num(fiber) } : {}),
      ...(num(sugar) > 0 ? { sugar: num(sugar) } : {}),
      ...(num(sodium) > 0 ? { sodium: num(sodium) } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
      date,
    });
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader title="Log Meal" onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} keyboardShouldPersistTaps="handled">
          {/* Food database search */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>FOOD DATABASE</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 12 }}>
              <MagnifyingGlass color={colors.textMuted} size={16} />
              <TextInput
                value={search}
                onChangeText={t => { setSearch(t); if (picked) setPicked(null); }}
                placeholder="Search roti, dal, chicken, oats…"
                placeholderTextColor={colors.textMuted}
                autoFocus
                style={{ flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 10, paddingVertical: 12 }}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10, paddingBottom: 2 }}>
              {FOOD_GROUPS.map(group => {
                const active = activeFoodGroup === group.id && !q;
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => {
                      setPicked(null);
                      setSearch('');
                      setActiveFoodGroup(group.id);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Show ${group.label} foods`}
                  >
                    <View style={{
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 999,
                      backgroundColor: active ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'),
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: active ? 'transparent' : colors.glassBorder,
                    }}>
                      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12, fontWeight: '800' }}>
                        {group.label}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {showQuickExtras && favoriteFoods.length > 0 && (
              <View style={{ marginTop: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <Star color="#E8A93E" size={13} weight="fill" />
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>FAVORITES</Text>
                </View>
                {favoriteFoods.slice(0, 6).map(food => (
                  <FoodRow key={`fav-${food.id}`} food={food} fav onTap={() => applyFood(food, 1)} onStar={() => onToggleFavorite(food.id)} />
                ))}
              </View>
            )}
            {showQuickExtras && recentDistinct.length > 0 && (
              <View style={{ marginTop: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <ClockCounterClockwise color={colors.textMuted} size={13} weight="bold" />
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.6 }}>RECENT</Text>
                </View>
                {recentDistinct.map(m => (
                  <Pressable key={`recent-${m.id}`} onPress={() => applyRecent(m)} accessibilityRole="button" accessibilityLabel={`Log ${m.name} again`}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{m.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>P {m.protein}g · C {m.carbs}g · F {m.fat}g</Text>
                      </View>
                      <Text style={{ color: TEAL, fontSize: 14, fontWeight: '800' }}>{Math.round(m.calories)} kcal</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, marginBottom: 2 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {q ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}` : `${FOOD_GROUPS.find(g => g.id === activeFoodGroup)?.label ?? 'Quick'} picks`}
              </Text>
              {onlineLoading ? <ActivityIndicator size="small" color={TEAL} /> : null}
            </View>
            {results.map(food => (
              <FoodRow
                key={food.id}
                food={food}
                fav={favoriteIds.includes(food.id)}
                onTap={() => applyFood(food, 1)}
                onStar={() => onToggleFavorite(food.id)}
              />
            ))}
            {!picked && q.length > 0 && q.length < 3 && results.length === 0 && (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700' }}>Keep typing…</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                  Type 3+ letters to search millions of foods online too.
                </Text>
              </View>
            )}
            {!picked && q.length >= 3 && !onlineLoading && results.length === 0 && (
              <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary, fontSize: 14, fontWeight: '700' }}>No matches</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>
                  Nothing found offline or online — enter calories/macros below and save it to My foods.
                </Text>
              </View>
            )}
            {picked && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: TEAL + '12', borderRadius: 14, borderWidth: 1, borderColor: TEAL + '33', padding: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700' }}>{picked.name}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>Amount: {qty} × {picked.serving}</Text>
                </View>
                <AnimatedPressable onPress={() => applyFood(picked, Math.max(0.25, Math.round((qty - 0.5) * 100) / 100))} scaleValue={0.85} haptic="light" style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.07)', borderRadius: 10, padding: 8 }}>
                  <Minus color={colors.text} size={14} weight="bold" />
                </AnimatedPressable>
                {/* Custom quantity — type any exact multiplier; keyed to qty so
                    the +/- buttons re-sync it, blur/done applies what you typed. */}
                <TextInput
                  key={`qty-${picked.id}-${qty}`}
                  defaultValue={String(qty)}
                  onEndEditing={(e) => {
                    const n = parseFloat(e.nativeEvent.text.replace(/[^0-9.]/g, ''));
                    applyFood(picked, Number.isFinite(n) && n > 0 ? n : 1);
                  }}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  selectTextOnFocus
                  accessibilityLabel="Quantity"
                  style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginHorizontal: 6, minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'], paddingVertical: 4 }}
                />
                <AnimatedPressable onPress={() => applyFood(picked, Math.round((qty + 0.5) * 100) / 100)} scaleValue={0.85} haptic="light" style={{ backgroundColor: TEAL, borderRadius: 10, padding: 8 }}>
                  <Plus color="#fff" size={14} weight="bold" />
                </AnimatedPressable>
              </View>
            )}
            {picked && (
              <View style={{ flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {[0.25, 0.5, 1, 1.5, 2, 3].map(p => {
                  const active = qty === p;
                  const label = p === 0.25 ? '¼' : p === 0.5 ? '½' : p === 1.5 ? '1½' : `${p}×`;
                  return (
                    <Pressable key={p} onPress={() => applyFood(picked, p)} style={{ flex: 1, minWidth: 44 }} accessibilityRole="button" accessibilityLabel={`Portion ${label}`}>
                      <View style={{ paddingVertical: 8, borderRadius: 10, alignItems: 'center', backgroundColor: active ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder }}>
                        <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* Day — log a meal for today or a recent day. */}
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 }}>DAY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {dayOptions.map(d => {
                const active = mealDate === d.iso;
                return (
                  <Pressable key={d.iso} onPress={() => setMealDate(d.iso)} accessibilityRole="button" accessibilityLabel={d.label}>
                    <View style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: active ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder }}>
                      <Text style={{ color: active ? '#fff' : colors.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{d.label}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 14, marginBottom: 8 }}>TIME</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <View style={{ backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 10 }}>
                <TextInput
                  value={mealTime}
                  onChangeText={setMealTime}
                  placeholder="HH:MM"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  accessibilityLabel="Meal time"
                  style={{ color: colors.text, fontSize: 15, fontWeight: '800', paddingVertical: 10, minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] }}
                />
              </View>
              {([['Now', ''], ['Morning', '08:00'], ['Noon', '13:00'], ['Evening', '19:00'], ['Night', '22:00']] as const).map(([label, val]) => (
                <Pressable
                  key={label}
                  onPress={() => {
                    if (val) { setMealTime(val); return; }
                    const d = new Date();
                    setMealTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                  }}
                  accessibilityRole="button" accessibilityLabel={label}
                >
                  <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mealTime === val ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: mealTime === val ? 'transparent' : colors.glassBorder }}>
                    <Text style={{ color: mealTime === val ? '#fff' : colors.textSecondary, fontSize: 12.5, fontWeight: '700' }}>{label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>

          <Field label="MEAL" value={name} onChange={setName} placeholder="e.g. Paneer wrap, Oats + banana" />
          <View>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 }}>WHEN</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {MEAL_KINDS.map(k => (
                <Pressable key={k.kind} onPress={() => setKind(k.kind)} style={{ flex: 1 }}>
                  <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: kind === k.kind ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: kind === k.kind ? 'transparent' : colors.glassBorder }}>
                    <Text style={{ color: kind === k.kind ? '#fff' : colors.text, fontWeight: '700', fontSize: 12 }}>{k.label}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
          <Field label="CALORIES (kcal)" value={calories} onChange={setCalories} placeholder="450" keyboard="decimal-pad" />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="PROTEIN (g)" value={protein} onChange={setProtein} placeholder="0" keyboard="decimal-pad" />
            <Field label="CARBS (g)" value={carbs} onChange={setCarbs} placeholder="0" keyboard="decimal-pad" />
            <Field label="FAT (g)" value={fat} onChange={setFat} placeholder="0" keyboard="decimal-pad" />
          </View>

          {/* More detail — optional fiber / sugar / note. */}
          <Pressable onPress={() => setShowMore(v => !v)} accessibilityRole="button">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {showMore ? <CaretUp color={TEAL} size={14} weight="bold" /> : <CaretDown color={TEAL} size={14} weight="bold" />}
              <Text style={{ color: TEAL, fontSize: 12.5, fontWeight: '700' }}>{showMore ? 'Hide extra detail' : 'Add fiber, sugar, or a note'}</Text>
            </View>
          </Pressable>
          {showMore && (
            <>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="FIBER (g)" value={fiber} onChange={setFiber} placeholder="0" keyboard="decimal-pad" />
                <Field label="SUGAR (g)" value={sugar} onChange={setSugar} placeholder="0" keyboard="decimal-pad" />
                <Field label="SODIUM (mg)" value={sodium} onChange={setSodium} placeholder="0" keyboard="decimal-pad" />
              </View>
              <Field label="NOTE" value={note} onChange={setNote} placeholder="e.g. post-workout, home-cooked, extra cheese" />
            </>
          )}

          {!picked && name.trim().length > 0 && (
            <Pressable onPress={() => setSaveToFoods(v => !v)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 7,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: saveToFoods ? TEAL : 'transparent',
                  borderWidth: saveToFoods ? 0 : 1.5, borderColor: colors.glassBorder,
                }}>
                  {saveToFoods && <FloppyDisk color="#fff" size={13} weight="fill" />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>
                  Save to my foods for next time
                </Text>
              </View>
            </Pressable>
          )}
          <SubmitBtn label="Log Meal" onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Fitness settings (profile, goal, targets, units, reminders) ──────────────

function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return <Text style={{ color: TEAL, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10, marginTop: 4 }}>{children}</Text>;
}

function Seg<T extends string | number>({ label, value, options, onChange }: { label?: string; value: T; options: { v: T; label: string; hint?: string }[]; onChange: (v: T) => void }) {
  const { colors } = useTheme();
  return (
    <View>
      {label ? <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 }}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        {options.map(o => {
          const active = o.v === value;
          return (
            <Pressable key={String(o.v)} onPress={() => onChange(o.v)} style={{ flex: 1, minWidth: 64 }}>
              <View style={{ paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, alignItems: 'center', backgroundColor: active ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: active ? 'transparent' : colors.glassBorder }}>
                <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '700', fontSize: 12.5 }} numberOfLines={1}>{o.label}</Text>
                {o.hint ? <Text style={{ color: active ? 'rgba(255,255,255,0.8)' : colors.textMuted, fontSize: 9.5, marginTop: 1 }} numberOfLines={1}>{o.hint}</Text> : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>{label}</Text>
        {hint ? <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: TEAL, false: colors.border }} />
    </View>
  );
}

function SettingsModal({ doc, weightKg, onSave, onClose }: {
  doc: FitnessDoc;
  weightKg: number;
  onSave: (settings: FitnessSettings, goals: FitnessGoals) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const s0 = doc.settings;
  const [sex, setSex] = useState<Sex>(s0.sex);
  const [age, setAge] = useState(String(s0.age));
  const [height, setHeight] = useState(String(s0.heightCm));
  const [activity, setActivity] = useState<ActivityLevel>(s0.activity);
  const [goalType, setGoalType] = useState<GoalType>(s0.goalType);
  const [targetW, setTargetW] = useState(s0.targetWeightKg ? String(s0.targetWeightKg) : '');
  const [auto, setAuto] = useState(s0.autoCalories);
  const [wUnit, setWUnit] = useState(s0.units.weight);
  const [hUnit, setHUnit] = useState(s0.units.height);
  const [waterUnit, setWaterUnit] = useState(s0.units.water);
  const [remMeals, setRemMeals] = useState(s0.reminders.meals);
  const [remWater, setRemWater] = useState(s0.reminders.water);
  const [remWorkout, setRemWorkout] = useState(s0.reminders.workout);
  const [cal, setCal] = useState(String(doc.goals.calories));
  const [protein, setProtein] = useState(String(doc.goals.protein));
  const [carbs, setCarbs] = useState(String(doc.goals.carbs));
  const [fat, setFat] = useState(String(doc.goals.fat));
  const [water, setWater] = useState(String(doc.goals.waterMl));
  const [weekly, setWeekly] = useState(doc.goals.workoutsPerWeek);

  const build = (): FitnessSettings => ({
    sex, age: num(age), heightCm: num(height), activity, goalType,
    targetWeightKg: num(targetW) > 0 ? num(targetW) : null, autoCalories: auto,
    units: { weight: wUnit, height: hUnit, water: waterUnit },
    reminders: { meals: remMeals, water: remWater, workout: remWorkout },
  });
  const preview = computeTargets(build(), weightKg);

  const submit = () => {
    const settings = build();
    if (settings.age <= 0 || settings.heightCm <= 0) { showToast('Add your age and height', 'Required'); return; }
    const goals = auto
      ? computeTargets(settings, weightKg)
      : { calories: num(cal), protein: num(protein), carbs: num(carbs), fat: num(fat), waterMl: num(water), workoutsPerWeek: weekly };
    if (Object.values(goals).some(v => v <= 0)) { showToast('Enter valid targets', 'Required'); return; }
    onSave(settings, goals); onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader title="Fitness Settings" onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <SectionLabel>Body</SectionLabel>
          <Seg label="SEX" value={sex} onChange={setSex} options={[{ v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }]} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field label="AGE" value={age} onChange={setAge} keyboard="decimal-pad" />
            <Field label={`HEIGHT (${hUnit})`} value={height} onChange={setHeight} keyboard="decimal-pad" />
          </View>
          <Seg label="ACTIVITY LEVEL" value={activity} onChange={setActivity} options={ACTIVITY_LABELS.map(a => ({ v: a.id, label: a.label, hint: a.hint }))} />

          <SectionLabel>Goal</SectionLabel>
          <Seg label="I WANT TO" value={goalType} onChange={setGoalType} options={[{ v: 'lose', label: 'Lose' }, { v: 'maintain', label: 'Maintain' }, { v: 'gain', label: 'Gain' }]} />
          <Field label={`TARGET WEIGHT (${wUnit}) — optional`} value={targetW} onChange={setTargetW} keyboard="decimal-pad" />

          <SectionLabel>Daily Targets</SectionLabel>
          <ToggleRow label="Auto-calculate from my profile" hint={`Estimated: ${preview.calories} kcal · ${preview.protein}p / ${preview.carbs}c / ${preview.fat}f`} value={auto} onChange={setAuto} />
          {auto ? (
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {[['Calories', `${preview.calories}`], ['Protein', `${preview.protein}g`], ['Carbs', `${preview.carbs}g`], ['Fat', `${preview.fat}g`], ['Water', `${preview.waterMl}ml`]].map(([l, v]) => (
                <View key={l} style={{ flexGrow: 1, minWidth: 90, borderRadius: 12, padding: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                  <Text style={{ color: TEAL, fontSize: 18, fontWeight: '800' }}>{v}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>{l}</Text>
                </View>
              ))}
            </View>
          ) : (
            <>
              <Field label="CALORIES (kcal / day)" value={cal} onChange={setCal} keyboard="decimal-pad" />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="PROTEIN (g)" value={protein} onChange={setProtein} keyboard="decimal-pad" />
                <Field label="CARBS (g)" value={carbs} onChange={setCarbs} keyboard="decimal-pad" />
                <Field label="FAT (g)" value={fat} onChange={setFat} keyboard="decimal-pad" />
              </View>
              <Field label={`WATER (${waterUnit} / day)`} value={water} onChange={setWater} keyboard="decimal-pad" />
            </>
          )}
          <Seg label="WORKOUTS / WEEK" value={weekly} onChange={setWeekly} options={[2, 3, 4, 5, 6].map(n => ({ v: n, label: String(n) }))} />

          <SectionLabel>Units</SectionLabel>
          <Seg label="WEIGHT" value={wUnit} onChange={setWUnit} options={[{ v: 'kg', label: 'kg' }, { v: 'lb', label: 'lb' }]} />
          <Seg label="HEIGHT" value={hUnit} onChange={setHUnit} options={[{ v: 'cm', label: 'cm' }, { v: 'ft', label: 'ft/in' }]} />
          <Seg label="WATER" value={waterUnit} onChange={setWaterUnit} options={[{ v: 'ml', label: 'ml' }, { v: 'oz', label: 'oz' }]} />

          <SectionLabel>Reminders</SectionLabel>
          <ToggleRow label="Log your meals" hint="A daily nudge to track what you ate" value={remMeals} onChange={setRemMeals} />
          <ToggleRow label="Drink water" hint="Gentle reminders through the day" value={remWater} onChange={setRemWater} />
          <ToggleRow label="Workout" hint="Stay on track with your weekly target" value={remWorkout} onChange={setRemWorkout} />

          <SubmitBtn label="Save Settings" onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Add workout ──────────────────────────────────────────────────────────────

interface DraftExercise { name: string; sets: string; reps: string; weight: string }
const emptyDraft = (): DraftExercise => ({ name: '', sets: '3', reps: '10', weight: '' });

const REST_OPTIONS = [60, 90, 120, 180];

function AddWorkoutModal({ mode = 'log', initial, onAdd, onSaveRoutine, onClose }: {
  mode?: 'log' | 'routine';
  initial?: Routine | null;
  onAdd?: (w: Workout) => void;
  onSaveRoutine?: (r: Routine) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [rows, setRows] = useState<DraftExercise[]>(() =>
    initial?.exercises.length
      ? initial.exercises.map(e => ({ name: e.name, sets: String(e.sets), reps: String(e.reps), weight: e.weight > 0 ? String(e.weight) : '' }))
      : [emptyDraft()],
  );
  const [restSec, setRestSec] = useState(initial?.restSec ?? 90);
  const [suggestFor, setSuggestFor] = useState<number | null>(null);

  const setRow = (i: number, patch: Partial<DraftExercise>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const suggestions = suggestFor != null ? searchExercises(rows[suggestFor]?.name ?? '') : [];

  const submit = () => {
    const exercises: WorkoutExercise[] = rows
      .filter(r => r.name.trim())
      .map(r => ({ name: r.name.trim(), sets: Math.max(1, Math.round(num(r.sets))), reps: Math.max(1, Math.round(num(r.reps))), weight: num(r.weight) }));
    if (exercises.length === 0) { showToast('Add at least one exercise', 'Required'); return; }
    if (mode === 'routine') {
      onSaveRoutine?.({ id: initial?.id ?? Date.now().toString(), title: title.trim() || 'Routine', exercises, restSec });
    } else {
      onAdd?.({ id: Date.now().toString(), title: title.trim() || 'Workout', exercises, date: new Date().toISOString() });
    }
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader title={mode === 'routine' ? (initial ? 'Edit Routine' : 'New Routine') : 'Log Workout'} onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Field
            label={mode === 'routine' ? 'ROUTINE NAME' : 'SESSION'}
            value={title} onChange={setTitle}
            placeholder="e.g. Push day, Legs" autoFocus={!initial}
          />
          {rows.map((row, i) => (
            <GlassPanel key={i} variant="light" borderRadius={16} contentStyle={{ padding: 14, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{`EXERCISE ${i + 1}`}</Text>
                  <TextInput
                    value={row.name}
                    onChangeText={v => { setRow(i, { name: v }); setSuggestFor(i); }}
                    onFocus={() => setSuggestFor(i)}
                    placeholder="Search 100+ exercises…"
                    placeholderTextColor={colors.textMuted}
                    style={{ color: colors.text, fontSize: 15, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)', borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder, paddingHorizontal: 14, paddingVertical: 12 }}
                  />
                </View>
                {rows.length > 1 && (
                  <AnimatedPressable onPress={() => setRows(rows.filter((_, j) => j !== i))} scaleValue={0.85} haptic="light" style={{ paddingBottom: 12 }} accessibilityRole="button" accessibilityLabel={`Remove exercise ${i + 1}`}>
                    <Trash color={colors.textMuted} size={17} />
                  </AnimatedPressable>
                )}
              </View>
              {suggestFor === i && suggestions.length > 0 && !suggestions.some(s => s.name === row.name) && (
                <View>
                  {suggestions.map(s => (
                    <Pressable key={s.id} onPress={() => { setRow(i, { name: s.name }); setSuggestFor(null); }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 }}>{s.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 11.5 }}>{s.muscle} · {s.equipment}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Field label="SETS" value={row.sets} onChange={v => setRow(i, { sets: v })} keyboard="decimal-pad" />
                <Field label="REPS" value={row.reps} onChange={v => setRow(i, { reps: v })} keyboard="decimal-pad" />
                <Field label="KG" value={row.weight} onChange={v => setRow(i, { weight: v })} placeholder="0 = body" keyboard="decimal-pad" />
              </View>
            </GlassPanel>
          ))}
          <Pressable onPress={() => setRows([...rows, emptyDraft()])}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: TEAL + '55', borderStyle: 'dashed' }}>
              <Plus color={TEAL} size={15} weight="bold" />
              <Text style={{ color: TEAL, fontWeight: '700', fontSize: 14 }}>Add exercise</Text>
            </View>
          </Pressable>
          {mode === 'routine' && (
            <View>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 }}>REST BETWEEN SETS</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {REST_OPTIONS.map(sec => (
                  <Pressable key={sec} onPress={() => setRestSec(sec)} style={{ flex: 1 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: restSec === sec ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'), borderWidth: StyleSheet.hairlineWidth, borderColor: restSec === sec ? 'transparent' : colors.glassBorder }}>
                      <Text style={{ color: restSec === sec ? '#fff' : colors.text, fontWeight: '700', fontSize: 13 }}>{sec}s</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
          <SubmitBtn label={mode === 'routine' ? 'Save Routine' : 'Save Workout'} onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Measurements ─────────────────────────────────────────────────────────────

function MeasurementModal({ latest, onAdd, onClose }: {
  latest: MeasurementEntry | undefined; onAdd: (m: MeasurementEntry) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(MEASUREMENT_FIELDS.map(f => [f.key, latest?.[f.key] ? String(latest[f.key]) : ''])),
  );

  const submit = () => {
    const entry: MeasurementEntry = { id: Date.now().toString(), date: new Date().toISOString() };
    let any = false;
    for (const f of MEASUREMENT_FIELDS) {
      const v = num(values[f.key]);
      if (v > 0) { entry[f.key] = v; any = true; }
    }
    if (!any) { showToast('Enter at least one measurement', 'Required'); return; }
    onAdd(entry);
    onClose();
  };

  return (
    <Modal animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <SheetHeader title="Body Measurements" onClose={onClose} />
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 20 }}>
            All in centimetres. Fill only what you measured — the rest carries over on the trend.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {MEASUREMENT_FIELDS.map(f => (
              <View key={f.key} style={{ width: '47%', flexGrow: 1 }}>
                <Field
                  label={`${f.label.toUpperCase()} (cm)`}
                  value={values[f.key]}
                  onChange={v => setValues({ ...values, [f.key]: v })}
                  keyboard="decimal-pad"
                  placeholder="—"
                />
              </View>
            ))}
          </View>
          <SubmitBtn label="Save Measurements" onPress={submit} />
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Progress chart ───────────────────────────────────────────────────────────

function WeightChart({ entries, colors }: { entries: WeightEntry[]; colors: any }) {
  const W = 300; const H = 120; const PADX = 10; const PADY = 14;
  const pts = [...entries].sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
  if (pts.length < 2) return null;
  const kgs = pts.map(p => p.kg);
  const min = Math.min(...kgs); const max = Math.max(...kgs);
  const span = Math.max(max - min, 0.5);
  const x = (i: number) => PADX + (i / (pts.length - 1)) * (W - PADX * 2);
  const y = (kg: number) => PADY + (1 - (kg - min) / span) * (H - PADY * 2);
  const points = pts.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ');
  return (
    <View>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Polyline points={points} fill="none" stroke={TEAL} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        {pts.map((p, i) => (
          <Circle key={p.id} cx={x(i)} cy={y(p.kg)} r={i === pts.length - 1 ? 4.5 : 2.5} fill={i === pts.length - 1 ? TEAL : colors.textMuted} />
        ))}
      </Svg>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{min.toFixed(1)} kg</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{max.toFixed(1)} kg</Text>
      </View>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────────────────

export default function FitnessApp() {
  const { colors, font } = useTheme();
  const [doc, setDoc] = useState<FitnessDoc | null>(null);
  const [tab, setTab] = useState<Tab>('meals');
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [showAddWorkout, setShowAddWorkout] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showMeasure, setShowMeasure] = useState(false);
  const [routineEditor, setRoutineEditor] = useState<Routine | 'new' | null>(null);
  const [activeRoutine, setActiveRoutine] = useState<Routine | null>(null);
  const [libQuery, setLibQuery] = useState('');
  const [libGroup, setLibGroup] = useState<MuscleGroup | 'All'>('All');

  useFocusEffect(useCallback(() => { loadFitness().then(setDoc); }, []));

  const update = (next: FitnessDoc) => { setDoc(next); saveFitness(next); };

  const removeItem = (label: string, apply: () => FitnessDoc) => {
    Alert.alert(`Delete ${label}?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => update(apply()) },
    ]);
  };

  const AddBtn = (tab === 'meals' || tab === 'workouts') ? (
    <AnimatedPressable
      onPress={() => (tab === 'meals' ? setShowAddMeal(true) : setShowAddWorkout(true))}
      scaleValue={0.88} haptic="medium" style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: TEAL, borderRadius: 12 }}
      accessibilityRole="button" accessibilityLabel={tab === 'meals' ? 'Add meal' : 'Add workout'}
    >
      <Plus color="#fff" size={18} weight="bold" />
    </AnimatedPressable>
  ) : null;

  // Settings gear + add button — in the header so they're always reachable
  // (the calorie-card pencil can sit under the floating agent overlay).
  const HeaderActions = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <AnimatedPressable
        onPress={() => setShowGoals(true)}
        scaleValue={0.88} haptic="light"
        style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 12 }}
        accessibilityRole="button" accessibilityLabel="Fitness settings"
      >
        <GearSix color={colors.textSecondary} size={19} weight="fill" />
      </AnimatedPressable>
      {AddBtn}
    </View>
  );

  if (!doc) return <MiniAppShell title="Fitness" subtitle="Fit"><View /></MiniAppShell>;

  const totals = todayMealTotals(doc.meals);
  const calPct = Math.min(100, Math.round((totals.calories / doc.goals.calories) * 100));
  const waterToday = todayWaterMl(doc.water);

  const addWater = (ml: number) => {
    update({ ...doc, water: [{ id: Date.now().toString(), ml, date: new Date().toISOString() }, ...doc.water] });
  };
  const undoWater = () => {
    const idx = doc.water.findIndex(w => isSameDay(w.date));
    if (idx < 0) return;
    update({ ...doc, water: doc.water.filter((_, i) => i !== idx) });
  };
  const weekWorkouts = doc.workouts.filter(w => Date.now() - new Date(w.date).getTime() < 7 * 86400000);
  const weekCount = thisWeekWorkoutCount(doc.workouts);
  const streak = weeklyStreak(doc.workouts, doc.goals.workoutsPerWeek);

  const saveLoggedWorkout = (w: Workout) => {
    const prs = detectPRs(doc.workouts, w);
    update({ ...doc, workouts: [w, ...doc.workouts] });
    showToast(prs.length ? `🏆 ${prs.length} new PR${prs.length === 1 ? '' : 's'}!` : `${w.title} saved`, 'Saved');
  };
  const sortedWeights = [...doc.weights].sort((a, b) => b.date.localeCompare(a.date));
  const latestWeight = sortedWeights[0];
  const firstWeight = sortedWeights[sortedWeights.length - 1];
  const delta = latestWeight && firstWeight ? latestWeight.kg - firstWeight.kg : 0;

  const sortedMeasures = [...doc.measurements].sort((a, b) => b.date.localeCompare(a.date));
  const latestMeasure = sortedMeasures[0];
  const prevMeasure = sortedMeasures[1];
  const liftMap = liftHistory(doc.workouts);
  const lifts = [...liftMap.values()].slice(0, 8);
  const weekly = weeklySummaries(doc, 4);
  const monthly = monthlySummaries(doc, 2);
  const libraryList = EXERCISE_CATALOG.filter(e =>
    (libGroup === 'All' || e.muscle === libGroup) &&
    (!libQuery.trim() || e.name.toLowerCase().includes(libQuery.trim().toLowerCase())),
  );

  const logWeight = () => {
    const kg = num(weightInput);
    if (kg <= 0 || kg > 400) { showToast('Enter a valid weight', 'Required'); return; }
    update({ ...doc, weights: [{ id: Date.now().toString(), kg, date: new Date().toISOString() }, ...doc.weights] });
    setWeightInput('');
    showToast(`${kg.toFixed(1)} kg logged`, 'Saved');
  };

  return (
    <MiniAppShell title="Fitness" subtitle="Fit" headerRight={HeaderActions}>
      <MiniCommandDeck
        accent={TEAL}
        title="Health operating system"
        subtitle="Meals, workouts, metrics."
        metrics={[
          { label: 'Calories', value: `${Math.round(totals.calories)}`, detail: `${calPct}% goal` },
          { label: 'Water', value: `${Math.round(waterToday / 1000)}L`, detail: 'today' },
          { label: 'Workouts', value: `${weekCount}`, detail: 'this week' },
        ]}
        chips={['Meals + macros', 'Workout flow', 'Progress trends']}
      />
      {/* Tabs */}
      <GlassPanel variant="light" borderRadius={14} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 16 }}>
        {TABS.map(t => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={{ flex: 1 }}
            accessibilityRole="tab"
            accessibilityLabel={t.label}
            accessibilityState={{ selected: tab === t.key }}
          >
            <View style={{ paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: tab === t.key ? TEAL : 'transparent' }}>
              <Text style={{ color: tab === t.key ? '#fff' : colors.textMuted, fontWeight: '700', fontSize: 12.5 }}>{t.label}</Text>
            </View>
          </Pressable>
        ))}
      </GlassPanel>

      <EdgeFeaturePanel
        appName="Fitness"
        accent={TEAL}
        headline="Fitness that turns into momentum"
        caption="Share progress, compare consistency, and convert training data into better next steps."
        metrics={[
          { label: 'Calories', value: `${Math.round(totals.calories)}` },
          { label: 'Workouts', value: `${weekCount}/${doc.goals.workoutsPerWeek}` },
          { label: 'Streak', value: `${streak}` },
        ]}
        prompt="Review my meals, workouts, and progress, then give me the next realistic adjustment for this week."
        shareText={`Fitness progress: ${Math.round(totals.calories)}/${doc.goals.calories} kcal today, ${weekCount}/${doc.goals.workoutsPerWeek} workouts this week, ${streak} week streak.`}
        publishTitle="Fitness progress"
        publishBody={`Today I logged ${Math.round(totals.calories)} kcal and ${Math.round(totals.protein)}g protein. This week I completed ${weekCount} of ${doc.goals.workoutsPerWeek} workouts with a ${streak}-week streak.`}
      />

      {/* ── Meals ── */}
      {tab === 'meals' && (
        <>
          <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }} elevated>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Today</Text>
                <Text style={{ color: colors.text, fontSize: 38, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>
                  {Math.round(totals.calories)}
                  <Text style={{ color: colors.textMuted, fontSize: 17 }}> / {doc.goals.calories} kcal</Text>
                </Text>
              </View>
              <AnimatedPressable onPress={() => setShowGoals(true)} scaleValue={0.9} haptic="light" hitSlop={10} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)' }} accessibilityRole="button" accessibilityLabel="Fitness settings">
                <PencilSimple color={colors.textSecondary} size={17} />
              </AnimatedPressable>
            </View>
            <View style={{ height: 8, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 4, overflow: 'hidden', marginTop: 12 }}>
              <View style={{ height: '100%', width: `${calPct}%`, backgroundColor: totals.calories > doc.goals.calories ? colors.danger : TEAL, borderRadius: 4 }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {[
                { label: 'Protein', value: `${Math.round(totals.protein)}g`, sub: `of ${doc.goals.protein}g` },
                { label: 'Carbs', value: `${Math.round(totals.carbs)}g`, sub: `of ${doc.goals.carbs}g` },
                { label: 'Fat', value: `${Math.round(totals.fat)}g`, sub: `of ${doc.goals.fat}g` },
              ].map(m => (
                <View key={m.label} style={{ flex: 1, backgroundColor: TEAL + '14', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: TEAL + '2A' }}>
                  <Text style={{ color: TEAL, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{m.label.toUpperCase()}</Text>
                  <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 3 }}>{m.value}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 11 }}>{m.sub}</Text>
                </View>
              ))}
            </View>
          </GlassPanel>

          {/* Water */}
          <GlassPanel variant="medium" borderRadius={22} contentStyle={{ padding: 18 }} style={{ marginBottom: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Drop color="#4E7A8B" size={26} weight="fill" />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: colors.text, fontSize: 17, fontWeight: '800' }}>
                  {waterToday >= 1000 ? `${(waterToday / 1000).toFixed(1)} L` : `${waterToday} ml`}
                  <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>  of {(doc.goals.waterMl / 1000).toFixed(1)} L</Text>
                </Text>
                <View style={{ height: 6, backgroundColor: colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)', borderRadius: 3, overflow: 'hidden', marginTop: 7 }}>
                  <View style={{ height: '100%', width: `${Math.min(100, Math.round((waterToday / doc.goals.waterMl) * 100))}%`, backgroundColor: '#4E7A8B', borderRadius: 3 }} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
              {[{ label: '+250 ml', ml: 250 }, { label: '+500 ml', ml: 500 }, { label: '+1 L', ml: 1000 }].map(opt => (
                <AnimatedPressable key={opt.ml} onPress={() => addWater(opt.ml)} scaleValue={0.94} haptic="light" style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Add ${opt.label} of water`}>
                  <View style={{ paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: '#4E7A8B18', borderWidth: 1, borderColor: '#4E7A8B33' }}>
                    <Text style={{ color: '#4E7A8B', fontWeight: '700', fontSize: 12.5 }} numberOfLines={1}>{opt.label}</Text>
                  </View>
                </AnimatedPressable>
              ))}
              {waterToday > 0 && (
                <AnimatedPressable onPress={undoWater} scaleValue={0.94} haptic="light" accessibilityRole="button" accessibilityLabel="Undo last water entry">
                  <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
                    <Text style={{ color: colors.textMuted, fontWeight: '700', fontSize: 12.5 }}>Undo</Text>
                  </View>
                </AnimatedPressable>
              )}
            </View>
          </GlassPanel>

          {totals.meals.length === 0 && (
            <MiniEmptyState
              accent={TEAL}
              icon={<ForkKnife color={colors.textMuted} size={44} weight="duotone" />}
              title="Nothing logged today"
              subtitle="Log the first meal to see calories, protein, and daily direction."
              actionLabel="Log your first meal"
              onAction={() => setShowAddMeal(true)}
            />
          )}

          {MEAL_KINDS.map(k => {
            const meals = totals.meals.filter(m => m.kind === k.kind);
            if (meals.length === 0) return null;
            return (
              <View key={k.kind} style={{ marginBottom: 14 }}>
                <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 8 }]}>{k.label}</Text>
                {meals.map((m, i) => (
                  <Animated.View key={m.id} entering={FadeInDown.delay(i * 40).duration(220)} style={{ marginBottom: 8 }}>
                    <GlassPanel variant="medium" borderRadius={16} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{m.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                          P {Math.round(m.protein)}g · C {Math.round(m.carbs)}g · F {Math.round(m.fat)}g
                        </Text>
                      </View>
                      <Text style={{ color: TEAL, fontSize: 16, fontWeight: '800' }}>{Math.round(m.calories)} kcal</Text>
                      <AnimatedPressable onPress={() => removeItem('meal', () => ({ ...doc, meals: doc.meals.filter(x => x.id !== m.id) }))} scaleValue={0.85} haptic="light" accessibilityRole="button" accessibilityLabel={`Delete ${m.name}`}>
                        <Trash color={colors.textMuted} size={16} />
                      </AnimatedPressable>
                    </GlassPanel>
                  </Animated.View>
                ))}
              </View>
            );
          })}
        </>
      )}

      {/* ── Workouts ── */}
      {tab === 'workouts' && (
        <>
          {/* Weekly goal + streak */}
          <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }} elevated>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>This week</Text>
                <Text style={{ color: colors.text, fontSize: 38, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>
                  {weekCount}
                  <Text style={{ color: colors.textMuted, fontSize: 17 }}> of {doc.goals.workoutsPerWeek} workouts</Text>
                </Text>
              </View>
              <Barbell color={TEAL} size={40} weight="fill" />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 12 }}>
              {Array.from({ length: doc.goals.workoutsPerWeek }).map((_, i) => (
                <View key={i} style={{
                  flex: 1, height: 8, borderRadius: 4,
                  backgroundColor: i < weekCount ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                }} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Fire color={streak > 0 ? '#B08536' : colors.textMuted} size={14} weight={streak > 0 ? 'fill' : 'regular'} />
              <Text style={{ color: streak > 0 ? '#B08536' : colors.textMuted, fontSize: 13, fontWeight: '700', flex: 1 }}>
                {streak > 0 ? `${streak}-week streak` : 'Hit your goal to start a streak'}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                {Math.round(weekWorkouts.reduce((s, w) => s + workoutVolume(w), 0)).toLocaleString()} kg this week
              </Text>
            </View>
          </GlassPanel>

          {/* Routines — the follow-along entry point */}
          <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 10 }}>
            <Text style={[font.eyebrow, { color: colors.textMuted, flex: 1 }]}>
              Routines
            </Text>
            <Pressable onPress={() => setRoutineEditor('new')} hitSlop={10}>
              <Text style={{ color: TEAL, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>+ New routine</Text>
            </Pressable>
          </View>
          {doc.routines.length === 0 ? (
            <Text style={{ color: colors.textMuted, fontSize: 13.5, lineHeight: 20, marginBottom: 16 }}>
              Save the workouts you repeat — then start one with a tap and follow along set by set, rest timer included.
            </Text>
          ) : (
            <View style={{ marginBottom: 16, gap: 10 }}>
              {doc.routines.map(r => (
                <GlassPanel key={r.id} variant="medium" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 }}>
                  <Pressable
                    onPress={() => setRoutineEditor(r)}
                    onLongPress={() => removeItem('routine', () => ({ ...doc, routines: doc.routines.filter(x => x.id !== r.id) }))}
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit routine ${r.title}`}
                    accessibilityHint="Double tap to edit, long press to delete"
                  >
                    <Text style={{ color: colors.text, fontSize: 15.5, fontWeight: '800' }}>{r.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                      {r.exercises.length} exercise{r.exercises.length === 1 ? '' : 's'} · {r.exercises.map(e => e.name).join(', ')}
                    </Text>
                  </Pressable>
                  <AnimatedPressable
                    onPress={() => setActiveRoutine(r)}
                    scaleValue={0.9} haptic="medium"
                    accessibilityRole="button" accessibilityLabel={`Start routine ${r.title}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: TEAL, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 }}
                  >
                    <Play color="#fff" size={13} weight="fill" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Start</Text>
                  </AnimatedPressable>
                </GlassPanel>
              ))}
            </View>
          )}

          {doc.workouts.length > 0 && (
            <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 10 }]}>
              History
            </Text>
          )}

          {doc.workouts.length === 0 && (
            <MiniEmptyState
              accent={TEAL}
              icon={<Barbell color={colors.textMuted} size={44} weight="duotone" />}
              title="No workouts logged"
              subtitle="Log a session to track volume, streaks, PRs, and consistency."
              actionLabel="Log your first workout"
              onAction={() => setShowAddWorkout(true)}
            />
          )}

          {doc.workouts.map((w, i) => (
            <Animated.View key={w.id} entering={FadeInDown.delay(Math.min(i, 6) * 40).duration(220)} style={{ marginBottom: 10 }}>
              <GlassPanel variant="medium" borderRadius={18} contentStyle={{ padding: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{w.title}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                      {new Date(w.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                      {isSameDay(w.date) ? ' · Today' : ''}
                    </Text>
                  </View>
                  <Text style={{ color: TEAL, fontSize: 14, fontWeight: '800' }}>{Math.round(workoutVolume(w)).toLocaleString()} kg</Text>
                  <AnimatedPressable onPress={() => removeItem('workout', () => ({ ...doc, workouts: doc.workouts.filter(x => x.id !== w.id) }))} scaleValue={0.85} haptic="light" style={{ marginLeft: 12 }} accessibilityRole="button" accessibilityLabel={`Delete workout ${w.title}`}>
                    <Trash color={colors.textMuted} size={16} />
                  </AnimatedPressable>
                </View>
                {w.exercises.map((e, j) => (
                  <View key={j} style={{ flexDirection: 'row', paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder }}>
                    <Text style={{ color: colors.text, fontSize: 13.5, flex: 1 }}>{e.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {e.sets} × {e.reps}{e.weight > 0 ? ` @ ${e.weight} kg` : ''}
                    </Text>
                  </View>
                ))}
              </GlassPanel>
            </Animated.View>
          ))}
        </>
      )}

      {/* ── Progress ── */}
      {tab === 'progress' && (
        <>
          <GlassPanel variant="medium" borderRadius={24} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }} elevated>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '600' }}>Body weight</Text>
                <Text style={{ color: colors.text, fontSize: 38, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -1 }}>
                  {latestWeight ? latestWeight.kg.toFixed(1) : '—'}
                  <Text style={{ color: colors.textMuted, fontSize: 17 }}> kg</Text>
                </Text>
                {sortedWeights.length > 1 && (
                  <Text style={{ color: delta <= 0 ? colors.success : colors.warning, fontSize: 13, fontWeight: '700', marginTop: 2 }}>
                    {delta > 0 ? '+' : ''}{delta.toFixed(1)} kg since {new Date(firstWeight.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </Text>
                )}
              </View>
              <TrendUp color={TEAL} size={36} weight="fill" />
            </View>
            {sortedWeights.length > 1 && (
              <View style={{ marginTop: 16 }}>
                <WeightChart entries={doc.weights} colors={colors} />
              </View>
            )}
          </GlassPanel>

          <GlassPanel variant="light" borderRadius={18} contentStyle={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 }} style={{ marginBottom: 16 }}>
            <TextInput
              value={weightInput} onChangeText={setWeightInput} placeholder="Today's weight (kg)"
              placeholderTextColor={colors.textMuted} keyboardType="decimal-pad"
              style={{ flex: 1, color: colors.text, fontSize: 15, paddingHorizontal: 8, paddingVertical: 8 }}
            />
            <AnimatedPressable onPress={logWeight} scaleValue={0.92} haptic="medium" style={{ backgroundColor: TEAL, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>Log</Text>
            </AnimatedPressable>
          </GlassPanel>

          {sortedWeights.map(w => (
            <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
              <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 }}>{w.kg.toFixed(1)} kg</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginRight: 14 }}>
                {new Date(w.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <AnimatedPressable onPress={() => removeItem('entry', () => ({ ...doc, weights: doc.weights.filter(x => x.id !== w.id) }))} scaleValue={0.85} haptic="light" accessibilityRole="button" accessibilityLabel={`Delete weight entry ${w.kg.toFixed(1)} kg`}>
                <Trash color={colors.textMuted} size={15} />
              </AnimatedPressable>
            </View>
          ))}
          {sortedWeights.length === 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>
              Log your weight to start the trend line.
            </Text>
          )}

          {/* Body measurements */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 24, marginBottom: 10 }}>
            <Text style={[font.eyebrow, { color: colors.textMuted, flex: 1 }]}>Measurements</Text>
            <AnimatedPressable onPress={() => setShowMeasure(true)} scaleValue={0.9} haptic="light" style={{ backgroundColor: TEAL + '18', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text style={{ color: TEAL, fontWeight: '700', fontSize: 12.5 }}>+ Log</Text>
            </AnimatedPressable>
          </View>
          {latestMeasure ? (
            <GlassPanel variant="light" borderRadius={18} contentStyle={{ flexDirection: 'row', flexWrap: 'wrap', padding: 14 }} style={{ marginBottom: 8 }}>
              {MEASUREMENT_FIELDS.map(f => {
                const cur = latestMeasure[f.key];
                if (!cur) return null;
                const prev = prevMeasure?.[f.key];
                const d = prev ? cur - prev : 0;
                return (
                  <View key={f.key} style={{ width: '33%', paddingVertical: 8 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 }}>{f.label.toUpperCase()}</Text>
                    <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginTop: 2 }}>{cur} <Text style={{ fontSize: 12, color: colors.textMuted }}>cm</Text></Text>
                    {prev && d !== 0 ? (
                      <Text style={{ color: d < 0 ? colors.success : colors.warning, fontSize: 11.5, fontWeight: '700' }}>{d > 0 ? '+' : ''}{d.toFixed(1)}</Text>
                    ) : null}
                  </View>
                );
              })}
            </GlassPanel>
          ) : (
            <Text style={{ color: colors.textMuted, fontSize: 13.5, marginBottom: 8 }}>
              Track chest, waist, hips, arms and thighs over time.
            </Text>
          )}

          {/* Lift progress */}
          {lifts.length > 0 && (
            <>
              <Text style={[font.eyebrow, { color: colors.textMuted, marginTop: 24, marginBottom: 10 }]}>Lifts</Text>
              <GlassPanel variant="light" borderRadius={18} contentStyle={{ paddingHorizontal: 16, paddingVertical: 4 }} style={{ marginBottom: 8 }}>
                {lifts.map(({ name, points }, i) => {
                  const [latest, prev] = points;
                  const cur1rm = est1RM(latest.weight, latest.reps);
                  const prev1rm = prev ? est1RM(prev.weight, prev.reps) : null;
                  const up = prev1rm != null && cur1rm > prev1rm + 0.1;
                  const down = prev1rm != null && cur1rm < prev1rm - 0.1;
                  return (
                    <View key={name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: i < lifts.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14.5, fontWeight: '700' }}>{name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                          {latest.sets} × {latest.reps} @ {latest.weight} kg · est 1RM {Math.round(cur1rm)} kg
                        </Text>
                      </View>
                      {up ? <TrendUp color={colors.success} size={18} weight="bold" /> : null}
                      {down ? <TrendUp color={colors.warning} size={18} weight="bold" style={{ transform: [{ scaleY: -1 }] }} /> : null}
                      {!up && !down ? <Text style={{ color: colors.textMuted, fontSize: 12 }}>{points.length}×</Text> : null}
                    </View>
                  );
                })}
              </GlassPanel>
            </>
          )}

          {/* Weekly + monthly logs */}
          <Text style={[font.eyebrow, { color: colors.textMuted, marginTop: 24, marginBottom: 10 }]}>Weekly log</Text>
          <GlassPanel variant="light" borderRadius={18} contentStyle={{ paddingHorizontal: 16, paddingVertical: 4 }} style={{ marginBottom: 8 }}>
            {weekly.map((wk, i) => (
              <View key={wk.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: i < weekly.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{wk.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
                  {wk.workouts} workout{wk.workouts === 1 ? '' : 's'} · {wk.volume.toLocaleString()} kg
                  {wk.avgCalories ? ` · ${wk.avgCalories} kcal/day` : ''}
                  {wk.waterPct ? ` · ${wk.waterPct}% water` : ''}
                </Text>
              </View>
            ))}
          </GlassPanel>

          <Text style={[font.eyebrow, { color: colors.textMuted, marginTop: 20, marginBottom: 10 }]}>Monthly log</Text>
          <GlassPanel variant="light" borderRadius={18} contentStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {monthly.map((mo, i) => (
              <View key={mo.label} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 11, borderBottomWidth: i < monthly.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder }}>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700', flex: 1 }}>{mo.label}</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
                  {mo.workouts} workout{mo.workouts === 1 ? '' : 's'} · {mo.volume.toLocaleString()} kg
                  {mo.avgCalories ? ` · ${mo.avgCalories} kcal/day` : ''}
                </Text>
              </View>
            ))}
          </GlassPanel>
        </>
      )}

      {/* ── Library ── */}
      {tab === 'library' && (
        <>
          <Text style={{ color: colors.textMuted, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
            {EXERCISE_CATALOG.length} exercises. Tap one for form cues — featured moves animate.
          </Text>

          <GlassPanel variant="light" borderRadius={14} contentStyle={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }} style={{ marginBottom: 10 }}>
            <MagnifyingGlass color={colors.textMuted} size={16} />
            <TextInput
              value={libQuery} onChangeText={setLibQuery}
              placeholder="Search exercises"
              placeholderTextColor={colors.textMuted}
              style={{ flex: 1, color: colors.text, fontSize: 14.5, paddingHorizontal: 10, paddingVertical: 11 }}
            />
            {libQuery ? <Pressable onPress={() => setLibQuery('')} hitSlop={8}><X color={colors.textMuted} size={14} /></Pressable> : null}
          </GlassPanel>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 14 }}>
            {(['All', ...MUSCLE_GROUPS] as const).map(g => (
              <Pressable key={g} onPress={() => setLibGroup(g)}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: libGroup === g ? TEAL : (colors.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)'), borderWidth: StyleSheet.hairlineWidth, borderColor: libGroup === g ? 'transparent' : colors.glassBorder }}>
                  <Text style={{ color: libGroup === g ? '#fff' : colors.text, fontWeight: '700', fontSize: 12.5 }}>{g}</Text>
                </View>
              </Pressable>
            ))}
          </ScrollView>

          {libraryList.map(item => {
            const open = expanded === item.id;
            const demo = item.demoId ? EXERCISES.find(e => e.id === item.demoId) : undefined;
            const history = liftMap.get(item.name.toLowerCase());
            const latest = history?.points[0];
            return (
              <View key={item.id} style={{ marginBottom: 8 }}>
                <GlassPanel variant="medium" borderRadius={16} contentStyle={{ padding: 14 }} style={open ? { borderColor: TEAL + '55' } : undefined}>
                  <Pressable onPress={() => setExpanded(open ? null : item.id)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{item.name}</Text>
                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 1 }}>
                          {item.muscle} · {item.equipment}
                          {latest ? ` · last ${latest.weight} kg × ${latest.reps}` : ''}
                        </Text>
                      </View>
                      {demo ? <Text style={{ color: TEAL, fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6, marginRight: 8 }}>DEMO</Text> : null}
                      {open ? <CaretUp color={TEAL} size={16} weight="bold" /> : <CaretDown color={colors.textMuted} size={16} />}
                    </View>
                  </Pressable>
                  {open && (
                    <View style={{ marginTop: 12 }}>
                      {demo ? (
                        <>
                          <View style={{ alignItems: 'center', backgroundColor: TEAL + '0E', borderRadius: 16, paddingVertical: 8 }}>
                            <ExerciseDemo exercise={demo} color={TEAL} muted={colors.textMuted} />
                          </View>
                          <View style={{ marginTop: 12, gap: 7 }}>
                            {demo.cues.map((cue, j) => (
                              <View key={j} style={{ flexDirection: 'row', gap: 8 }}>
                                <Text style={{ color: TEAL, fontSize: 13, fontWeight: '800' }}>{j + 1}</Text>
                                <Text style={{ color: colors.text, fontSize: 13.5, lineHeight: 19, flex: 1 }}>{cue}</Text>
                              </View>
                            ))}
                          </View>
                        </>
                      ) : null}
                      {history ? (
                        <View style={{ marginTop: demo ? 12 : 0 }}>
                          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>YOUR HISTORY</Text>
                          {history.points.slice(0, 5).map((p, j) => (
                            <View key={j} style={{ flexDirection: 'row', paddingVertical: 5 }}>
                              <Text style={{ color: colors.textMuted, fontSize: 12.5, width: 74 }}>
                                {new Date(p.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </Text>
                              <Text style={{ color: colors.text, fontSize: 12.5, fontVariant: ['tabular-nums'] }}>
                                {p.sets} × {p.reps} @ {p.weight} kg · est 1RM {Math.round(est1RM(p.weight, p.reps))} kg
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        !demo ? (
                          <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                            Log it from the Workouts tab to start tracking sets, reps and weight.
                          </Text>
                        ) : null
                      )}
                    </View>
                  )}
                </GlassPanel>
              </View>
            );
          })}
          {libraryList.length === 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 24 }}>No exercises match.</Text>
          )}
        </>
      )}

      {showAddMeal && (
        <AddMealModal
          customFoods={doc.customFoods}
          recentMeals={doc.meals}
          favoriteIds={doc.favoriteFoodIds}
          onToggleFavorite={id => update({ ...doc, favoriteFoodIds: doc.favoriteFoodIds.includes(id) ? doc.favoriteFoodIds.filter(x => x !== id) : [id, ...doc.favoriteFoodIds] })}
          onAdd={m => { update({ ...doc, meals: [m, ...doc.meals] }); showToast(`${m.name} logged`, 'Saved'); }}
          onSaveFood={f => update({ ...doc, customFoods: [f, ...doc.customFoods.filter(x => x.name.toLowerCase() !== f.name.toLowerCase())] })}
          onClose={() => setShowAddMeal(false)}
        />
      )}
      {showAddWorkout && <AddWorkoutModal onAdd={saveLoggedWorkout} onClose={() => setShowAddWorkout(false)} />}
      {routineEditor !== null && (
        <AddWorkoutModal
          mode="routine"
          initial={routineEditor === 'new' ? null : routineEditor}
          onSaveRoutine={r => {
            const exists = doc.routines.some(x => x.id === r.id);
            update({ ...doc, routines: exists ? doc.routines.map(x => x.id === r.id ? r : x) : [r, ...doc.routines] });
            showToast(`${r.title} saved`, 'Saved');
          }}
          onClose={() => setRoutineEditor(null)}
        />
      )}
      {activeRoutine && (
        <WorkoutSession
          routine={activeRoutine}
          history={doc.workouts}
          onFinish={(w, prs) => {
            update({ ...doc, workouts: [w, ...doc.workouts] });
            setActiveRoutine(null);
            showToast(prs.length ? `🏆 ${prs.length} new PR${prs.length === 1 ? '' : 's'}!` : `${w.title} saved`, 'Saved');
          }}
          onClose={() => setActiveRoutine(null)}
        />
      )}
      {showGoals && <SettingsModal doc={doc} weightKg={sortedWeights[0]?.kg ?? 0} onSave={(settings, goals) => { update({ ...doc, settings, goals }); syncFitnessReminders(settings); showToast('Settings saved', 'Saved'); }} onClose={() => setShowGoals(false)} />}
      {showMeasure && <MeasurementModal latest={latestMeasure} onAdd={m => { update({ ...doc, measurements: [m, ...doc.measurements] }); showToast('Measurements logged', 'Saved'); }} onClose={() => setShowMeasure(false)} />}
    </MiniAppShell>
  );
}
