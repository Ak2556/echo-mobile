import React, { useState } from 'react';
import { View, Text, Pressable, Alert, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowLeft, Warning, Trash } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { useTheme } from '../lib/theme';
import { deleteAccount } from '../lib/supabaseEchoApi';
import { supabase } from '../lib/supabase';
import { useAppStore } from '../store/useAppStore';
import { showToast } from '../components/ui/Toast';
import { track } from '../lib/analytics';

/**
 * In-app account deletion — required by Apple App Store guideline 5.1.1(v).
 *
 * Two-step confirmation: the user types DELETE into a confirm field, then
 * taps a destructive button that calls the `delete_account()` SQL RPC. On
 * success we clear the session, reset local state, and route back to /auth/
 * login. On failure we show a toast — the local state is untouched, so the
 * user can retry.
 */
export default function DeleteAccountScreen() {
  const router = useRouter();
  const { colors, radius } = useTheme();
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const { resetSocialData, clearChatHistory } = useAppStore();

  const canDelete = confirmText.trim().toUpperCase() === 'DELETE' && !deleting;

  const handleDelete = async () => {
    if (!canDelete) return;
    setDeleting(true);
    try {
      await deleteAccount();
      track('account_deleted');
      // Best-effort: revoke session locally even though the auth.users row is
      // gone server-side. signOut() drops the AsyncStorage session entry.
      await supabase.auth.signOut().catch(() => undefined);
      resetSocialData();
      clearChatHistory();
      showToast('Account deleted', 'Done');
      router.replace('/auth/login');
    } catch (e) {
      Alert.alert('Could not delete account', (e as Error).message);
      setDeleting(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ padding: 4, marginRight: 12 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18, flex: 1 }}>Delete account</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }} keyboardShouldPersistTaps="handled">
        {/* Warning hero */}
        <View
          style={{
            backgroundColor: colors.danger + '12',
            borderRadius: radius.card,
            borderWidth: 1,
            borderColor: colors.danger + '30',
            padding: 16,
            flexDirection: 'row',
            gap: 12,
            alignItems: 'flex-start',
          }}
        >
          <Warning color={colors.danger} size={22} weight="duotone" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginBottom: 4 }}>
              This is permanent
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
              We&apos;ll delete your profile, echoes, comments, reactions, bookmarks, and
              chat history. None of it can be recovered.
            </Text>
          </View>
        </View>

        {/* What gets deleted */}
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' }}>
            What we delete
          </Text>
          {[
            'Your profile and avatar',
            'Every echo and comment you posted',
            'Reactions, bookmarks, follows, mutes',
            'Direct messages you sent',
            'Your AI chat history',
            'Push token and email/phone reservation',
          ].map(item => (
            <Text key={item} style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 22 }}>
              · {item}
            </Text>
          ))}
        </View>

        {/* Confirmation field */}
        <View style={{ marginTop: 12, gap: 8 }}>
          <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>
            Type <Text style={{ color: colors.danger, fontWeight: '800' }}>DELETE</Text> to confirm
          </Text>
          <TextInput
            value={confirmText}
            onChangeText={setConfirmText}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect={false}
          />
        </View>

        {/* Destructive CTA — visual treatment on the View so the flex row
            survives Release builds (Pressable.style function gets dropped). */}
        <View style={{
          marginTop: 12,
          backgroundColor: canDelete ? colors.danger : colors.surfaceHover,
          borderRadius: radius.lg,
          opacity: canDelete ? 1 : 0.5,
        }}>
          <Pressable
            onPress={handleDelete}
            disabled={!canDelete}
            style={{
              paddingVertical: 14,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
            accessibilityRole="button"
            accessibilityLabel="Delete my account"
          >
            {deleting
              ? <ActivityIndicator color="#fff" />
              : <>
                <Trash color="#fff" size={16} weight="bold" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Delete my account</Text>
              </>}
          </Pressable>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={{ marginTop: 4, alignItems: 'center', paddingVertical: 12 }}
        >
          <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Cancel</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
