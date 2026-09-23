import React, { useCallback, useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Cake } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { ttx } from '../../src/shared/lib/i18n';
import { MINIMUM_AGE, checkDateOfBirth, ageRejectionMessage } from '../../constants/legal/ageGate';
import { needsDateOfBirth } from '../../lib/interestsSync';
import { fetchMyAgeYears, syncInterests, updateRemoteProfile } from '../../lib/supabaseEchoApi';
import { useAppStore } from '../../store/useAppStore';

/**
 * Asks for a date of birth, once, and does not take no for an answer.
 *
 * Two things depend on it. Echo is 18+, and the age is enforced in Postgres —
 * but only for accounts that have one on file, and none of the accounts that
 * existed before the wizard collected it do. And the personalized feed is
 * gated on a known adult age, so without this every account falls back to the
 * same ranking a signed-out visitor gets.
 *
 * Submitting also pushes the interests already chosen on this device, which
 * seeds the taste vector, so the next feed reflects them immediately.
 */
export function DateOfBirthGate() {
  const { colors, radius } = useTheme();
  const interests = useAppStore(s => s.interests);
  const [needed, setNeeded] = useState(false);
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchMyAgeYears()
      .then(age => { if (alive) setNeeded(needsDateOfBirth(age)); })
      // Never trap someone behind a question we could not ask properly.
      .catch(() => { if (alive) setNeeded(false); });
    return () => { alive = false; };
  }, []);

  const submit = useCallback(async () => {
    if (saving) return;
    const d = Number(day), m = Number(month), y = Number(year);
    if (!d || !m || !y || String(year).length !== 4) {
      setError(ttx('Enter the day, month and year.'));
      return;
    }
    // Month is 0-indexed, and UTC so the same birthday never shifts by a day.
    const dob = new Date(Date.UTC(y, m - 1, d));
    if (dob.getUTCDate() !== d || dob.getUTCMonth() !== m - 1) {
      setError(ttx('That date does not exist.'));
      return;
    }
    const check = checkDateOfBirth(dob);
    if (!check.ok) {
      setError(ttx(ageRejectionMessage(check.reason)));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateRemoteProfile({ date_of_birth: dob.toISOString().slice(0, 10) });
      // Best effort, and never a reason to keep the gate up.
      await syncInterests(interests ?? []);
      setNeeded(false);
    } catch (e) {
      setSaving(false);
      setError((e as Error).message);
    }
  }, [day, month, year, saving, interests]);

  if (!needed) return null;

  const field = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: 12,
    textAlign: 'center' as const,
    fontSize: 18,
    flex: 1,
  };

  return (
    <Modal visible transparent={false} animationType="slide" onRequestClose={() => {}}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
          <View style={{
            width: 60, height: 60, borderRadius: 30, alignSelf: 'center', marginBottom: 20,
            backgroundColor: colors.accent + '18', alignItems: 'center', justifyContent: 'center',
          }}>
            <Cake color={colors.accent} size={28} weight="duotone" />
          </View>

          <Text style={{ color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center', letterSpacing: -0.4 }}>
            {ttx('When were you born?')}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 12 }}>
            {ttx(`Echo is for people aged ${MINIMUM_AGE} and over, and we have to ask everyone once. It is never shown on your profile and no other user can see it.`)}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 28 }}>
            <TextInput
              value={day} onChangeText={setDay} placeholder={ttx('DD')} placeholderTextColor={colors.textMuted}
              keyboardType="number-pad" maxLength={2} style={field} accessibilityLabel={ttx('Day of birth')}
            />
            <TextInput
              value={month} onChangeText={setMonth} placeholder={ttx('MM')} placeholderTextColor={colors.textMuted}
              keyboardType="number-pad" maxLength={2} style={field} accessibilityLabel={ttx('Month of birth')}
            />
            <TextInput
              value={year} onChangeText={setYear} placeholder={ttx('YYYY')} placeholderTextColor={colors.textMuted}
              keyboardType="number-pad" maxLength={4} style={[field, { flex: 1.4 }]} accessibilityLabel={ttx('Year of birth')}
            />
          </View>

          {error ? (
            <Text style={{ color: colors.danger, fontSize: 14, marginTop: 14, textAlign: 'center' }}>{error}</Text>
          ) : null}

          {/* Wrapper View owns the fill so cssInterop cannot drop the background. */}
          <View style={{ marginTop: 24, borderRadius: radius.lg, backgroundColor: colors.accent, opacity: saving ? 0.7 : 1 }}>
            <Pressable
              onPress={submit}
              disabled={saving}
              accessibilityRole="button"
              style={({ pressed }) => ({ paddingVertical: 15, alignItems: 'center', opacity: pressed ? 0.9 : 1 })}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>{ttx('Continue')}</Text>}
            </Pressable>
          </View>

          <Text style={{ color: colors.textMuted, fontSize: 12.5, lineHeight: 18, textAlign: 'center', marginTop: 18 }}>
            {ttx('Your date of birth also lets Echo tailor your feed to what you follow and the interests you picked.')}
          </Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
