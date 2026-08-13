import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { Barbell } from 'phosphor-react-native';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { MiniAppShell } from '../../components/mini-apps/MiniAppShell';
import { EdgeFeaturePanel } from '../../components/mini-apps/EdgeFeaturePanel';
import { MiniCommandDeck } from '../../components/mini-apps/MiniKit';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { useTheme } from '../../lib/theme';
import { showToast } from '../../components/ui/Toast';
import { loadFitness, saveFitness } from '../../lib/fitness';
import { ttx } from '../../lib/i18n';

type Unit = 'metric' | 'imperial';
type Sex = 'male' | 'female';

const ACTIVITY_LEVELS = [
  { label: 'Sedentary', caption: 'Desk life, little exercise', factor: 1.2 },
  { label: 'Light', caption: '1–3 workouts a week', factor: 1.375 },
  { label: 'Moderate', caption: '3–5 workouts a week', factor: 1.55 },
  { label: 'Active', caption: '6–7 workouts a week', factor: 1.725 },
];

const CATS: { label: string; range: string; tone: 'textSecondary' | 'success' | 'warning' | 'danger'; min: number; max: number; marker: string; advice: string }[] = [
  { label: 'Underweight', range: '< 18.5', tone: 'textSecondary', min: 0, max: 18.5, marker: 'Low', advice: 'Consider consulting a nutritionist to reach a healthy weight.' },
  { label: 'Normal', range: '18.5–24.9', tone: 'success', min: 18.5, max: 25, marker: 'OK', advice: "You're in the healthy range. Keep it up!" },
  { label: 'Overweight', range: '25–29.9', tone: 'warning', min: 25, max: 30, marker: 'High', advice: 'Light diet changes and regular exercise can help.' },
  { label: 'Obese I', range: '30–34.9', tone: 'danger', min: 30, max: 35, marker: 'I', advice: 'Consult a doctor and consider a structured program.' },
  { label: 'Obese II', range: '35–39.9', tone: 'danger', min: 35, max: 40, marker: 'II', advice: 'Medical supervision is strongly recommended.' },
  { label: 'Obese III', range: '≥ 40', tone: 'danger', min: 40, max: 99, marker: 'III', advice: 'Please seek professional medical advice immediately.' },
];

function getCat(bmi: number) {
  return CATS.find(c => bmi >= c.min && bmi < c.max) ?? CATS[CATS.length - 1];
}

function InputField({ label, value, onChange, placeholder, unit }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; unit?: string }) {
  const { colors, radius } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{label}</Text>
      <View style={{
        flexDirection: 'row', alignItems: 'flex-end',
        backgroundColor: colors.inputBg,
        borderRadius: radius.card, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: value ? colors.accent : colors.glassBorder,
      }}>
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.text, fontSize: 22, fontWeight: '300' }}
        />
        {unit && <Text style={{ color: colors.textMuted, fontSize: 14, marginLeft: 4, marginBottom: 2 }}>{unit}</Text>}
      </View>
    </View>
  );
}

function HealthPulse({ accent, bmi, category, idealRange, calories, unit }: {
  accent: string;
  bmi: number | null;
  category: ReturnType<typeof getCat> | null;
  idealRange: string;
  calories?: number;
  unit: Unit;
}) {
  const { colors, radius } = useTheme();
  const tiles = [
    { label: 'BMI', value: bmi ? bmi.toFixed(1) : 'Set', detail: category?.label ?? 'input' },
    { label: 'Ideal', value: idealRange, detail: unit === 'metric' ? 'kg range' : 'lb range' },
    { label: 'Energy', value: calories ? `${calories}` : 'Age', detail: calories ? 'kcal/day' : 'needed' },
  ];
  return (
    <GlassPanel variant="light" borderRadius={radius.xl} contentStyle={{ padding: 16, gap: 13 }} style={{ marginBottom: 14, borderColor: colors.glassBorder }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 42, height: 42, borderRadius: radius.card, backgroundColor: colors.surfaceHover, alignItems: 'center', justifyContent: 'center' }}>
          <Barbell color={accent} size={20} weight="fill" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.text, fontSize: 17, fontWeight: '900' }}>{ttx("Health baseline")}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12.5, fontWeight: '600', marginTop: 2 }}>{ttx("BMI, range, calories.")}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tiles.map(tile => (
          <View key={tile.label} style={{ flex: 1, minHeight: 64, borderRadius: radius.card, padding: 10, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.glassBorder }}>
            <Text style={{ color: accent, fontSize: tile.value.length > 8 ? 13 : 17, fontWeight: '900' }} numberOfLines={1}>{tile.value}</Text>
            <Text style={{ color: colors.text, fontSize: 11.5, fontWeight: '900', marginTop: 4 }}>{tile.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10.5, fontWeight: '700', marginTop: 1 }} numberOfLines={1}>{tile.detail}</Text>
          </View>
        ))}
      </View>
    </GlassPanel>
  );
}

export default function BmiScreen() {
  const { colors, radius } = useTheme();
  const accent = colors.accent;

  const [unit, setUnit] = useState<Unit>('metric');
  const [weight, setWeight] = useState('');
  const [height, setHeight] = useState('');
  const [heightFt, setHeightFt] = useState('');
  const [heightIn, setHeightIn] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState<Sex>('male');
  const [activityIdx, setActivityIdx] = useState(1);
  const [applying, setApplying] = useState(false);

  const bodyMetrics = (): { kg: number; cm: number } | null => {
    const w = parseFloat(weight);
    const kg = unit === 'imperial' ? w * 0.453592 : w;
    let cm: number;
    if (unit === 'metric') cm = parseFloat(height);
    else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      cm = (ft * 12 + inch) * 2.54;
    }
    if (!kg || !cm || kg <= 0 || cm <= 0) return null;
    return { kg, cm };
  };

  // Mifflin-St Jeor — the standard clinical estimate.
  const energy = (): { bmr: number; tdee: number; protein: number; fat: number; carbs: number } | null => {
    const m = bodyMetrics();
    const a = parseFloat(age);
    if (!m || !a || a < 10 || a > 100) return null;
    const bmr = 10 * m.kg + 6.25 * m.cm - 5 * a + (sex === 'male' ? 5 : -161);
    const tdee = bmr * ACTIVITY_LEVELS[activityIdx].factor;
    const protein = Math.round(m.kg * 1.8);
    const fat = Math.round((tdee * 0.25) / 9);
    const carbs = Math.round((tdee - protein * 4 - fat * 9) / 4);
    return { bmr: Math.round(bmr), tdee: Math.round(tdee), protein, fat, carbs };
  };

  const applyToFitness = async () => {
    const e = energy();
    const m = bodyMetrics();
    if (!e || !m) return;
    setApplying(true);
    try {
      const doc = await loadFitness();
      await saveFitness({
        ...doc,
        weights: [{ id: Date.now().toString(), kg: Math.round(m.kg * 10) / 10, date: new Date().toISOString() }, ...doc.weights],
        goals: { ...doc.goals, calories: e.tdee, protein: e.protein, carbs: e.carbs, fat: e.fat },
      });
      showToast('Fitness targets updated', 'Saved');
    } catch {
      showToast('Could not update targets', 'Error');
    } finally {
      setApplying(false);
    }
  };

  const calcBmi = (): number | null => {
    const w = parseFloat(weight);
    const wKg = unit === 'imperial' ? w * 0.453592 : w;
    let hM: number;
    if (unit === 'metric') {
      hM = parseFloat(height) / 100;
    } else {
      const ft = parseFloat(heightFt) || 0;
      const inch = parseFloat(heightIn) || 0;
      hM = (ft * 12 + inch) * 0.0254;
    }
    if (!wKg || !hM || hM <= 0) return null;
    return wKg / (hM * hM);
  };

  const bmi = calcBmi();
  const cat = bmi ? getCat(bmi) : null;
  const catColor = cat ? colors[cat.tone] : accent;
  const pct = bmi ? Math.min(100, Math.max(0, ((bmi - 10) / 35) * 100)) : 0;
  const eNow = energy();
  const healthAccent = catColor;

  const getIdealRange = (): string => {
    let hM: number;
    if (unit === 'metric') hM = parseFloat(height) / 100;
    else { const ft = parseFloat(heightFt)||0, inch = parseFloat(heightIn)||0; hM = (ft*12+inch)*0.0254; }
    if (!hM) return '—';
    const minKg = 18.5*hM*hM, maxKg = 24.9*hM*hM;
    return unit === 'metric' ? `${minKg.toFixed(1)}–${maxKg.toFixed(1)} kg` : `${(minKg/0.453592).toFixed(1)}–${(maxKg/0.453592).toFixed(1)} lbs`;
  };

  return (
    <MiniAppShell title={ttx("BMI Calculator")} subtitle={ttx("Body mass index")}>
      <MiniCommandDeck
        accent={healthAccent}
        title={ttx("Body metrics into targets")}
        subtitle={ttx("BMI, energy, macros, Fitness sync.")}
        metrics={[
          { label: 'BMI', value: bmi ? bmi.toFixed(1) : 'Set', detail: 'baseline' },
          { label: 'Class', value: cat?.marker ?? '-', detail: cat?.label ?? 'pending' },
          { label: 'Calories', value: eNow ? `${eNow.tdee}` : 'Age', detail: eNow ? 'TDEE' : 'needed' },
        ]}
        chips={['BMI range', 'Macro targets', 'Fitness sync']}
      />
      <HealthPulse accent={healthAccent} bmi={bmi} category={cat} idealRange={getIdealRange()} calories={eNow?.tdee} unit={unit} />
      {/* Unit toggle */}
      <GlassPanel variant="light" borderRadius={radius.xl} contentStyle={{ flexDirection: 'row', padding: 4 }} style={{ marginBottom: 16 }}>
        {(['metric', 'imperial'] as Unit[]).map(u => (
          <Pressable
            key={u}
            onPress={() => setUnit(u)}
            style={{ flex: 1, paddingVertical: 11, borderRadius: radius.card, backgroundColor: unit === u ? accent : 'transparent', alignItems: 'center' }}
          >
            <Text style={{ color: unit === u ? colors.bg : colors.textMuted, fontWeight: '700', fontSize: 14 }}>
              {u === 'metric' ? 'Metric' : 'Imperial'}
            </Text>
            <Text style={{ color: unit === u ? colors.bg : colors.textMuted, fontSize: 11, marginTop: 2 }}>
              {u === 'metric' ? 'kg · cm' : 'lbs · ft'}
            </Text>
          </Pressable>
        ))}
      </GlassPanel>

      {/* Inputs */}
      <GlassPanel variant="medium" borderRadius={radius.xl} contentStyle={{ padding: 20, gap: 16 }} style={{ marginBottom: 14 }}>
        <InputField
          label={`WEIGHT (${unit === 'metric' ? 'kg' : 'lbs'})`}
          value={weight} onChange={setWeight}
          placeholder={unit === 'metric' ? '70' : '154'}
          unit={unit === 'metric' ? 'kg' : 'lbs'}
        />
        {unit === 'metric' ? (
          <InputField label={ttx("HEIGHT (cm)")} value={height} onChange={setHeight} placeholder="175" unit="cm" />
        ) : (
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <InputField label={ttx("FEET")} value={heightFt} onChange={setHeightFt} placeholder="5" unit="ft" />
            <InputField label={ttx("INCHES")} value={heightIn} onChange={setHeightIn} placeholder="9" unit="in" />
          </View>
        )}
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <InputField label={ttx("AGE")} value={age} onChange={setAge} placeholder="28" unit="yrs" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 6 }}>{ttx("SEX")}</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {(['male', 'female'] as Sex[]).map(s => (
                <Pressable key={s} onPress={() => setSex(s)} style={{ flex: 1 }}>
                  <View style={{ paddingVertical: 14, borderRadius: radius.card, alignItems: 'center', backgroundColor: sex === s ? accent : colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: sex === s ? 'transparent' : colors.glassBorder }}>
                    <Text style={{ color: sex === s ? colors.bg : colors.text, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{s}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </GlassPanel>

      {bmi && cat && (
        <>
          {/* BMI result */}
          <View style={{ backgroundColor: colors.surfaceHover, borderRadius: radius.xl, borderWidth: 1.5, borderColor: catColor, padding: 28, alignItems: 'center', marginBottom: 14 }}>
            <Text style={{ color: catColor, fontSize: 14, fontWeight: '800', marginBottom: 4 }}>{cat.marker}</Text>
            <Text style={{ color: catColor, fontSize: 76, fontFamily: 'Fraunces_500Medium', letterSpacing: -2, lineHeight: 84 }}>{bmi.toFixed(1)}</Text>
            <Text style={{ color: catColor, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>{cat.label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{ttx("BMI range:")} {cat.range}</Text>
          </View>

          {/* Scale */}
          <GlassPanel variant="medium" borderRadius={radius.xl} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
            <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 14 }}>{ttx("BMI SCALE")}</Text>
            <View style={{ height: 14, borderRadius: radius.sm, overflow: 'hidden', flexDirection: 'row', marginBottom: 8 }}>
              {CATS.slice(0, 5).map((c, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: colors[c.tone] }} />
              ))}
            </View>
            <View style={{ position: 'relative', height: 20 }}>
              <View style={{ position: 'absolute', left: `${pct}%`, top: 0, width: 3, height: 20, backgroundColor: colors.text, borderRadius: radius.sm, marginLeft: -1.5 }} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              {['10', '18.5', '25', '30', '40'].map(v => (
                <Text key={v} style={{ color: colors.textMuted, fontSize: 10 }}>{v}</Text>
              ))}
            </View>
          </GlassPanel>

          {/* Energy: BMR / TDEE / macros */}
          {(() => {
            const e = energy();
            if (!e) {
              return (
                <GlassPanel variant="light" borderRadius={radius.xl} contentStyle={{ padding: 18 }} style={{ marginBottom: 14 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 13.5, lineHeight: 20 }}>
                    {ttx("Add your age to unlock daily energy needs (BMR & TDEE) and a macro plan.")}
                  </Text>
                </GlassPanel>
              );
            }
            return (
              <GlassPanel variant="medium" borderRadius={radius.xl} contentStyle={{ padding: 20 }} style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 12 }}>{ttx("DAILY ENERGY")}</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  {ACTIVITY_LEVELS.map((a, i) => (
                    <Pressable key={a.label} onPress={() => setActivityIdx(i)} style={{ flex: 1 }}>
                      <View style={{ paddingVertical: 9, borderRadius: radius.md, alignItems: 'center', backgroundColor: activityIdx === i ? accent : colors.surfaceHover, borderWidth: StyleSheet.hairlineWidth, borderColor: activityIdx === i ? 'transparent' : colors.glassBorder }}>
                        <Text style={{ color: activityIdx === i ? colors.bg : colors.text, fontWeight: '700', fontSize: 11.5 }}>{a.label}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
                <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 14 }}>{ACTIVITY_LEVELS[activityIdx].caption}</Text>

                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1, backgroundColor: colors.surfaceHover, borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.glassBorder }}>
                    <Text style={{ color: accent, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 }}>{ttx("BMR (AT REST)")}</Text>
                    <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', marginTop: 3 }}>{e.bmr}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ttx("kcal / day")}</Text>
                  </View>
                  <View style={{ flex: 1, backgroundColor: colors.surfaceHover, borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.glassBorder }}>
                    <Text style={{ color: accent, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6 }}>{ttx("TDEE (MAINTAIN)")}</Text>
                    <Text style={{ color: colors.text, fontSize: 24, fontFamily: 'Fraunces_600SemiBold', marginTop: 3 }}>{e.tdee}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{ttx("kcal / day")}</Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                  {[
                    { label: 'PROTEIN', value: `${e.protein}g` },
                    { label: 'CARBS', value: `${e.carbs}g` },
                    { label: 'FAT', value: `${e.fat}g` },
                  ].map(m => (
                    <View key={m.label} style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.md, backgroundColor: colors.surfaceHover }}>
                      <Text style={{ color: colors.textMuted, fontSize: 9.5, fontWeight: '700', letterSpacing: 0.6 }}>{m.label}</Text>
                      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800', marginTop: 2 }}>{m.value}</Text>
                    </View>
                  ))}
                </View>

                <AnimatedPressable
                  onPress={() => void applyToFitness()}
                  disabled={applying}
                  scaleValue={0.96} haptic="medium"
                  style={{ backgroundColor: colors.success, borderRadius: radius.card, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: applying ? 0.6 : 1 }}
                >
                  <Barbell color={colors.bg} size={16} weight="fill" />
                  <Text style={{ color: colors.bg, fontWeight: '800', fontSize: 14.5 }}>
                    {ttx("Set as my Fitness targets")}
                  </Text>
                </AnimatedPressable>
                <Text style={{ color: colors.textMuted, fontSize: 11.5, marginTop: 8, textAlign: 'center' }}>
                  {ttx("Writes calories & macros to the Fitness app and logs today’s weight.")}
                </Text>
              </GlassPanel>
            );
          })()}

          {/* Stats */}
          <GlassPanel variant="light" borderRadius={radius.xl} contentStyle={{ overflow: 'hidden' }} style={{ marginBottom: 14 }}>
            {[
              { label: 'Ideal weight range', value: getIdealRange() },
              { label: 'Category', value: `${cat.label} (${cat.range})` },
            ].map((row) => (
              <View key={row.label} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>{row.label}</Text>
                <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>{row.value}</Text>
              </View>
            ))}
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, backgroundColor: colors.surfaceHover }}>
              <Text style={{ color: catColor, fontSize: 14, fontWeight: '600', lineHeight: 20 }}>{cat.advice}</Text>
            </View>
          </GlassPanel>

          <EdgeFeaturePanel
            appName="BMI Calculator"
            accent={catColor}
            headline={ttx("Turn body metrics into a plan")}
            caption={ttx("Share non-sensitive targets, compare progress, or move calories/macros into Fitness.")}
            metrics={[
              { label: 'BMI', value: bmi.toFixed(1) },
              { label: 'Category', value: cat.marker },
              { label: 'Ideal', value: getIdealRange() },
            ]}
            prompt={`Create a realistic health plan from BMI ${bmi.toFixed(1)} (${cat.label}) and ideal range ${getIdealRange()}.`}
            shareText={`BMI: ${bmi.toFixed(1)} (${cat.label}). Ideal weight range: ${getIdealRange()}.`}
            publishTitle="Health baseline"
            publishBody={`My current BMI baseline is ${bmi.toFixed(1)} (${cat.label}). Ideal weight range: ${getIdealRange()}.`}
          />

          {/* Legend */}
          <GlassPanel variant="light" borderRadius={radius.xl} contentStyle={{ overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.glassBorder }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1 }}>{ttx("ALL CATEGORIES")}</Text>
            </View>
            {CATS.map((c, i) => {
              const cColor = colors[c.tone];
              const isCurrent = cat.label === c.label;
              return (
                <View key={c.label} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 11, borderBottomWidth: i < CATS.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.glassBorder, backgroundColor: isCurrent ? colors.surfaceHover : 'transparent' }}>
                  <View style={{ width: 10, height: 10, borderRadius: radius.sm, backgroundColor: cColor, marginRight: 12 }} />
                  <Text style={{ color: isCurrent ? cColor : colors.text, flex: 1, fontSize: 14, fontWeight: isCurrent ? '700' : '400' }}>{c.label}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12 }}>{c.range}</Text>
                </View>
              );
            })}
          </GlassPanel>
        </>
      )}
    </MiniAppShell>
  );
}
