import React from 'react';
import { Sparkle } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { ConsentSheet } from '../consent/ConsentSheet';
import { answerAiConsent, useAiConsent } from '../../lib/aiConsent';

/** The one-time question in front of Echo's AI features (see lib/aiConsent.ts). */
export function AiConsentSheet() {
  const { colors } = useTheme();
  return (
    <ConsentSheet
      gate={{ useConsent: useAiConsent, answer: answerAiConsent }}
      icon={<Sparkle color={colors.accent} size={26} weight="duotone" />}
      title="Echo's AI uses Google Gemini"
      paragraphs={[
        "When you chat with Echo AI, give a voice command, or ask for a rewrite or coaching, what you send goes to Google's Gemini service to produce the answer: your message and recent conversation, or your voice recording.",
        'Nothing is sent until you use one of these features. You can change this at any time in Settings → Privacy.',
      ]}
      allowLabel="Allow and continue"
      declineLabel="Not now"
    />
  );
}
