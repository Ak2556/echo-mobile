import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ArrowRight, ChatCircleText, CheckCircle, PencilSimpleLine, Sparkle } from 'phosphor-react-native';
import { useAuth } from '../lib/auth';
import { streamEchoAI } from '../lib/api';
import { track } from '../lib/analytics';
import { primaryInterestPrompt } from '../lib/productOnboarding';
import { useResponsiveLayout } from '../lib/responsive';
import { setPendingPublishContext } from '../lib/publishContext';
import { useTheme } from '../lib/theme';
import { useAppStore } from '../store/useAppStore';
import { TextInput } from '../components/ui/TextInput';

type StepKey = 'promise' | 'chat' | 'reply' | 'draft';

const STEPS: { key: StepKey; label: string }[] = [
  { key: 'promise', label: 'Think' },
  { key: 'chat', label: 'Chat' },
  { key: 'reply', label: 'Shape' },
  { key: 'draft', label: 'Draft' },
];

export default function ProductOnboardingScreen() {
  const router = useRouter();
  const { status } = useAuth();
  const { colors, radius, font } = useTheme();
  const layout = useResponsiveLayout();
  const interests = useAppStore(s => s.interests);
  const aiModel = useAppStore(s => s.aiModel);
  const promptSeed = useMemo(() => primaryInterestPrompt(interests[0]), [interests]);
  const [step, setStep] = useState<StepKey>('promise');
  const [prompt, setPrompt] = useState(promptSeed);
  const [response, setResponse] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const responseRef = useRef('');
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('product_onboarding_started');
  }, []);

  useEffect(() => {
    if (status === 'signed-out') router.replace('/auth/login');
    if (status === 'needs-onboarding') router.replace('/auth/signup-wizard');
  }, [router, status]);

  const currentStepIndex = Math.max(0, STEPS.findIndex(item => item.key === step));
  const canSend = prompt.trim().length > 0 && !loading;
  const canDraft = response.trim().length > 0 && !loading;

  const skip = () => {
    track('product_onboarding_skipped', { step });
    router.replace('/(tabs)/home');
  };

  const sendPrompt = async () => {
    if (!canSend) return;
    const cleanPrompt = prompt.trim();
    setLoading(true);
    setError('');
    setResponse('');
    responseRef.current = '';
    setStep('chat');
    track('product_onboarding_chat_sent', { prompt_length: cleanPrompt.length, model: aiModel });
    try {
      await streamEchoAI({
        message: cleanPrompt,
        preferredModel: aiModel,
        currentScreen: '/onboarding',
        conversationId: conversationId ?? undefined,
        onEvent: (event) => {
          if (event.type === 'conversation') {
            setConversationId(event.id);
          } else if (event.type === 'text_delta') {
            responseRef.current += event.delta;
            setResponse(responseRef.current);
          }
        },
      });
      if (!responseRef.current.trim()) {
        throw new Error('empty onboarding response');
      }
      setStep('reply');
    } catch {
      setError('Connection lost. Try again.');
      setStep('chat');
    } finally {
      setLoading(false);
    }
  };

  const createDraft = () => {
    if (!canDraft) return;
    const cleanPrompt = prompt.trim();
    const cleanResponse = response.trim();
    setPendingPublishContext({
      sourceConversationId: conversationId ?? undefined,
      conversationSnapshot: [
        { role: 'user', content: cleanPrompt },
        { role: 'assistant', content: cleanResponse },
      ],
    });
    setStep('draft');
    router.push({
      pathname: '/share',
      params: { prompt: cleanPrompt, response: cleanResponse, onboarding: '1' },
    });
  };

  if (status === 'checking') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: layout.gutter,
            paddingTop: layout.isDesktop ? 56 : 28,
            paddingBottom: 28,
          }}
        >
          <View style={[layout.wideContentStyle, { flex: 1, justifyContent: 'center' }]}>
            <View style={{ flexDirection: layout.isWide ? 'row' : 'column', gap: layout.isWide ? 20 : 16, alignItems: 'stretch' }}>
              <View style={{ flex: layout.isWide ? 0.92 : undefined, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 28 }}>
                  {STEPS.map((item, index) => {
                    const active = item.key === step;
                    const done = index < currentStepIndex;
                    return (
                      <View
                        key={item.key}
                        style={{
                          flex: 1,
                          height: 4,
                          borderRadius: 999,
                          backgroundColor: active || done ? colors.accent : colors.surfaceHover,
                        }}
                        accessibilityLabel={item.label}
                      />
                    );
                  })}
                </View>

                <Text style={[font.bodySemibold, { color: colors.textMuted, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 16 }]}>
                  Your first Echo
                </Text>

                <Text style={[font.display, {
                  color: colors.text,
                  fontSize: layout.isPhone ? 34 : 44,
                  lineHeight: layout.isPhone ? 39 : 50,
                  letterSpacing: 0,
                  marginBottom: 12,
                }]}>
                  Think with Echo. Publish what&apos;s worth keeping.
                </Text>
                <Text style={[font.body, {
                  color: colors.textSecondary,
                  fontSize: 16,
                  lineHeight: 24,
                  marginBottom: 26,
                  maxWidth: 620,
                }]}>
                  Start with a question. Echo helps shape the answer into something clear enough to save, edit, and publish.
                </Text>

                {step === 'promise' ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <PrimaryButton label="Start first chat" icon={<ChatCircleText color="#fff" size={18} weight="bold" />} onPress={() => setStep('chat')} />
                    <SecondaryButton label="Skip for now" onPress={skip} />
                  </View>
                ) : (
                  <View style={{ gap: 14 }}>
                    <View>
                      <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginBottom: 8 }]}>
                        Your first prompt
                      </Text>
                      <TextInput
                        value={prompt}
                        onChangeText={setPrompt}
                        editable={!loading}
                        maxLength={240}
                        style={{ minHeight: 76 }}
                      />
                    </View>

                    {error ? (
                      <View style={{
                        borderRadius: radius.lg,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.danger,
                        backgroundColor: colors.dangerMuted,
                        padding: 14,
                      }}>
                        <Text style={[font.bodySemibold, { color: colors.text, fontSize: 14 }]}>{error}</Text>
                      </View>
                    ) : null}

                    {response ? (
                      <View style={{
                        borderRadius: radius.card,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        padding: 16,
                      }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <CheckCircle color={colors.accent} size={18} weight="fill" />
                          <Text style={[font.bodyBold, { color: colors.text, fontSize: 14 }]}>
                            This can become an Echo
                          </Text>
                        </View>
                        <Text style={[font.body, { color: colors.textSecondary, fontSize: 15, lineHeight: 23 }]}>
                          {response}
                        </Text>
                      </View>
                    ) : null}

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                      {!response || error ? (
                        <PrimaryButton
                          label={loading ? 'Thinking' : error ? 'Retry' : 'Send to Echo'}
                          icon={loading ? <ActivityIndicator color="#fff" /> : <ArrowRight color="#fff" size={18} weight="bold" />}
                          onPress={() => { void sendPrompt(); }}
                          disabled={!canSend}
                        />
                      ) : (
                        <PrimaryButton
                          label="Create share draft"
                          icon={<PencilSimpleLine color="#fff" size={18} weight="bold" />}
                          onPress={createDraft}
                          disabled={!canDraft}
                        />
                      )}
                      <SecondaryButton label="Skip for now" onPress={skip} />
                    </View>
                  </View>
                )}
              </View>

              {layout.isWide ? (
                <View style={{
                  flex: 0.72,
                  minWidth: 320,
                  borderRadius: radius.card,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: 18,
                  alignSelf: 'center',
                }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 15, marginBottom: 14 }]}>
                    The Echo loop
                  </Text>
                  <PreviewRow icon={<ChatCircleText color={colors.accent} size={18} weight="bold" />} title="Ask" body={prompt} />
                  <PreviewRow icon={<Sparkle color={colors.accent} size={18} weight="fill" />} title="Shape" body={response || 'Echo turns the idea into a clearer take.'} />
                  <PreviewRow icon={<PencilSimpleLine color={colors.accent} size={18} weight="bold" />} title="Draft" body="Open the editor, trim the answer, and publish when it is ready." />
                </View>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PrimaryButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{
        minHeight: 50,
        borderRadius: radius.lg,
        backgroundColor: colors.accent,
        opacity: disabled ? 0.55 : 1,
        paddingHorizontal: 18,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 9,
      }}
    >
      {icon}
      <Text style={[font.bodyBold, { color: '#fff', fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

function SecondaryButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors, radius, font } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={{
        minHeight: 50,
        borderRadius: radius.lg,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        backgroundColor: colors.surface,
        paddingHorizontal: 18,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={[font.bodyBold, { color: colors.textSecondary, fontSize: 15 }]}>{label}</Text>
    </Pressable>
  );
}

function PreviewRow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  const { colors, font } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 12 }}>
      <View style={{ marginTop: 1 }}>{icon}</View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[font.bodyBold, { color: colors.text, fontSize: 14, marginBottom: 3 }]}>{title}</Text>
        <Text style={[font.body, { color: colors.textMuted, fontSize: 13, lineHeight: 19 }]} numberOfLines={4}>
          {body}
        </Text>
      </View>
    </View>
  );
}
