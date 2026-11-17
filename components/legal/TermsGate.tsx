import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, signOut } from '../../lib/auth';
import { fetchMyLegalAcceptance, recordLegalAcceptance } from '../../lib/supabaseEchoApi';
import {
  ACCEPTED_STORAGE_KEY, CURRENT_LEGAL, acceptedToken, hasAcceptedCurrent,
} from '../../lib/legal/acceptance';
import { useTermsGateStore } from '../../lib/legal/gateStore';
import { isSupabaseRemote } from '../../lib/core/remoteConfig';
import { openExternalUrl } from '../../lib/routing/openExternalUrl';
import { PUBLIC_WEB_ORIGIN } from '../../lib/routing/publicHost';
import { persistGet, persistSet } from '../../store/persist';
import { useTheme } from '../../lib/ui/theme';
import { ttx } from '../../lib/i18n/i18n';

/**
 * Asks signed-in people to agree to the Terms of Service and the Privacy Policy, once per version.
 *
 * Sign-up used to show the two documents as a line of text under the buttons and keep no record that
 * anyone agreed. Google and Apple sign-in create an account from the "Sign up" side or the "Log in"
 * side alike, so the agreement cannot sit on one screen. It is asked here instead, for whoever is
 * signed in and has no record for the current versions: new accounts, existing accounts once, and
 * everyone again after TERMS_VERSION or PRIVACY_VERSION changes (lib/legal/acceptance.ts).
 *
 * Declining signs out. A failed lookup never blocks: an offline launch must not lock anyone out of
 * their own account, and the check runs again next launch. A failed save keeps the gate up with a
 * retry, because an agreement that was not recorded is not one.
 */
export function TermsGate() {
  const { status, session } = useAuth();
  const { colors, radius, font } = useTheme();
  const userId = status === 'ready' || status === 'needs-onboarding' ? session?.user?.id ?? null : null;
  const [needed, setNeeded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const setGateOpen = useTermsGateStore((s) => s.setOpen);

  // Tell the birthday card to wait while this is up (lib/legal/gateStore.ts).
  useEffect(() => {
    setGateOpen(needed);
    return () => setGateOpen(false);
  }, [needed, setGateOpen]);

  useEffect(() => {
    setNeeded(false);
    setFailed(false);
    if (!userId || !isSupabaseRemote()) return;
    const token = acceptedToken(userId);
    if (persistGet<string>(ACCEPTED_STORAGE_KEY, '') === token) return;
    let live = true;
    void fetchMyLegalAcceptance()
      .then((rows) => {
        if (!live) return;
        if (hasAcceptedCurrent(rows)) persistSet(ACCEPTED_STORAGE_KEY, token);
        else setNeeded(true);
      })
      .catch(() => { /* see the note above: never lock anyone out on a failed read */ });
    return () => { live = false; };
  }, [userId]);

  if (!userId) return null;

  const agree = async () => {
    if (saving) return;
    setSaving(true);
    setFailed(false);
    try {
      await recordLegalAcceptance(CURRENT_LEGAL.terms, CURRENT_LEGAL.privacy);
      persistSet(ACCEPTED_STORAGE_KEY, acceptedToken(userId));
      setNeeded(false);
    } catch {
      setFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const decline = () => {
    setNeeded(false);
    void signOut();
  };

  return (
    <Modal visible={needed} animationType="fade" onRequestClose={() => { /* a gate: Back must not dismiss it */ }}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <Text style={[font.display, { color: colors.text, fontSize: 26, marginBottom: 12 }]} accessibilityRole="header">
            {ttx('Before you continue')}
          </Text>
          <Text style={[font.body, { color: colors.textSecondary, fontSize: 16, lineHeight: 24, marginBottom: 24 }]}>
            {ttx('Echo is for people aged 18 and over. Please read and agree to our Terms of Service and Privacy Policy to keep using Echo.')}
          </Text>

          <LinkRow label={ttx('Read the Terms of Service')} url={`${PUBLIC_WEB_ORIGIN}/terms`} />
          <LinkRow label={ttx('Read the Privacy Policy')} url={`${PUBLIC_WEB_ORIGIN}/privacy`} />

          {failed && (
            <Text style={[font.body, { color: colors.danger, fontSize: 14, marginTop: 8 }]} accessibilityRole="alert">
              {ttx('Could not save your choice. Check your connection and try again.')}
            </Text>
          )}

          <Pressable onPress={agree} disabled={saving} accessibilityRole="button" accessibilityLabel={ttx('Agree and continue')} style={{ marginTop: 24 }}>
            {/* Layout on the inner View: layout props on a Pressable's style are dropped in release builds. */}
            <View style={{ backgroundColor: colors.accent, borderRadius: radius.full, paddingVertical: 16, alignItems: 'center', opacity: saving ? 0.7 : 1 }}>
              {saving
                ? <ActivityIndicator color={colors.onAccent} />
                : <Text style={[font.bodyBold, { color: colors.onAccent, fontSize: 17 }]}>{ttx('Agree and continue')}</Text>}
            </View>
          </Pressable>

          <Pressable onPress={decline} disabled={saving} accessibilityRole="button" accessibilityLabel={ttx('Decline and sign out')} style={{ marginTop: 12 }}>
            <View style={{ paddingVertical: 14, alignItems: 'center' }}>
              <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 15 }]}>{ttx('Decline and sign out')}</Text>
            </View>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable onPress={() => { void openExternalUrl(url); }} accessibilityRole="link" accessibilityLabel={label}>
      <View style={{ borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, paddingVertical: 14, paddingHorizontal: 16, marginBottom: 10 }}>
        <Text style={[font.bodySemibold, { color: colors.text, fontSize: 16 }]}>{label}</Text>
      </View>
    </Pressable>
  );
}
