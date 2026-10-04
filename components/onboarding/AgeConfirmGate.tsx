import React, { useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Cake } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { ttx } from '../../src/shared/lib/i18n';
import { useAuthStore } from '../../lib/auth/store';
import { signOut } from '../../lib/auth';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import { fetchMyAgeYears, saveMyDateOfBirth } from '../../lib/supabaseEchoApi';
import { syncNotificationProfile } from '../../lib/ai/personalNudges';
import { useAppStore } from '../../store/useAppStore';
import { ageRejectionMessage } from '../../constants/legal/ageGate';
import { parseDobFields, shouldAskForAge } from '../../lib/privacy/ageConfirm';

/**
 * One-time birthday card for accounts that have no date of birth on file.
 *
 * Accounts created before the sign-up wizard's age step (47 of 48 on
 * 2026-09-30) were never asked. Echo is 18+, and without a birthday the minors
 * safeguard also keeps personalized notifications and feed personalization off
 * for them. Owner decision: not skippable; the only way out is Log out.
 *
 * It sits over the app as a Modal rather than a route, so it never navigates
 * during cold start. It appears only when the server positively says there is
 * no birthday; a failed check shows nothing and asks again next launch.
 */
export function AgeConfirmGate() {
  const { colors, font, fontSizes, radius } = useTheme();
  const signedIn = useAuthStore(s => s.status === 'ready');
  const queryClient = useQueryClient();
  const { data: age, isSuccess } = useQuery({
    queryKey: ['age', 'me'],
    queryFn: fetchMyAgeYears,
    enabled: signedIn && isSupabaseRemote(),
    staleTime: Infinity,
    retry: 1,
  });

  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const monthRef = useRef<TextInput>(null);
  const yearRef = useRef<TextInput>(null);

  if (!shouldAskForAge({ signedIn, fetched: isSuccess, age })) return null;

  const { check, iso } = parseDobFields(day, month, year);

  const save = async () => {
    if (!iso || saving) return;
    setSaving(true);
    setServerError(null);
    try {
      await saveMyDateOfBirth(iso);
      // Nudges are on by default for adults; bring this device in line and
      // upload its notification profile now rather than next sign-in.
      useAppStore.getState().setPersonalizedNotifications(true);
      void syncNotificationProfile(true);
      queryClient.setQueryData(['age', 'me'], check?.ok ? check.age : 18);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setServerError(code === '23514' ? ageRejectionMessage('too-young') : ttx("Couldn't save that. Check your connection and try again."));
    } finally {
      setSaving(false);
    }
  };

  const field = (value: string, onChange: (v: string) => void, placeholder: string, width: number, max: number, next?: React.RefObject<TextInput | null>, ref?: React.RefObject<TextInput | null>) => (
    <TextInput
      ref={ref}
      value={value}
      onChangeText={v => {
        const digits = v.replace(/\D/g, '').slice(0, max);
        onChange(digits);
        if (digits.length === max) next?.current?.focus();
      }}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      keyboardType="number-pad"
      maxLength={max}
      accessibilityLabel={placeholder}
      style={[font.bodySemibold, {
        width, textAlign: 'center', fontSize: 20, color: colors.text, paddingVertical: 12,
        borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
      }]}
    />
  );

  const error = serverError ?? (check && !check.ok ? ageRejectionMessage(check.reason) : null);

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={() => {}} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentMuted }}>
            <Cake color={colors.accent} size={28} weight="fill" />
          </View>
          <Text style={[font.display, { color: colors.text, fontSize: 28, lineHeight: 34 }]}>{ttx('Confirm your birthday')}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.body, lineHeight: 22 }}>
            {ttx('Echo is for people 18 and over. We ask once, it never appears on your profile, and nobody else can see it.')}
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            {field(day, setDay, ttx('DD'), 72, 2, monthRef)}
            {field(month, setMonth, ttx('MM'), 72, 2, yearRef, monthRef)}
            {field(year, setYear, ttx('YYYY'), 104, 4, undefined, yearRef)}
          </View>

          {error && <Text style={{ color: colors.danger, fontSize: fontSizes.small, lineHeight: 20 }}>{error}</Text>}

          <Pressable onPress={() => { void save(); }} disabled={!iso || saving} accessibilityRole="button" accessibilityState={{ disabled: !iso || saving }}>
            <View style={{ marginTop: 8, minHeight: 50, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: iso ? colors.accent : colors.surfaceHover, opacity: saving ? 0.6 : 1 }}>
              <Text style={[font.bodyBold, { color: iso ? '#fff' : colors.textMuted, fontSize: fontSizes.body }]}>{saving ? ttx('Saving…') : ttx('Continue')}</Text>
            </View>
          </Pressable>

          <Pressable onPress={() => { void signOut(); }} accessibilityRole="button" hitSlop={8}>
            <Text style={{ textAlign: 'center', color: colors.textMuted, fontSize: fontSizes.small, marginTop: 4 }}>{ttx('Log out')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
