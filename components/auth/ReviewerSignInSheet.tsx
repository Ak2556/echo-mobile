import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { useTheme } from '../../src/shared/lib/theme';

interface ReviewerSignInSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null on success. */
  onSubmit: (email: string, password: string) => Promise<string | null>;
}

/**
 * Email + password form for the store reviewers' account.
 *
 * Deliberately undiscoverable: opened by a long press on the wordmark, as the
 * review notes explain. It is harmless if someone finds it, since it grants
 * nothing without the credentials. English-only on purpose, because reviewers
 * are its only audience.
 */
export function ReviewerSignInSheet({ visible, onClose, onSubmit }: ReviewerSignInSheetProps) {
  const { colors, radius, font } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const message = await onSubmit(email, password);
    setBusy(false);
    if (message) setError(message);
  };

  const input = {
    color: colors.text,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 24 }}
      >
        <View style={{ backgroundColor: colors.bg, borderRadius: 20, padding: 20, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 18 }]}>Reviewer sign-in</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            accessibilityLabel="Reviewer email"
            style={input}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="Password"
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            textContentType="password"
            onSubmitEditing={submit}
            accessibilityLabel="Reviewer password"
            style={input}
          />
          {error ? <Text style={{ color: colors.danger, fontSize: 14 }}>{error}</Text> : null}
          <View style={{ backgroundColor: colors.accent, borderRadius: radius.full, opacity: busy ? 0.6 : 1 }}>
            <Pressable
              onPress={submit}
              disabled={busy}
              accessibilityRole="button"
              style={{ paddingVertical: 14, alignItems: 'center' }}
            >
              <Text style={[font.bodyBold, { color: '#fff', fontSize: 16 }]}>{busy ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} accessibilityRole="button" style={{ paddingVertical: 10, alignItems: 'center' }}>
            <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 15 }]}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
