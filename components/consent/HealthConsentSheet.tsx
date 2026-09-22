import React from 'react';
import { Heartbeat } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { ConsentSheet } from './ConsentSheet';
import { answerHealthConsent, useHealthConsent } from '../../lib/healthConsent';

/** The one-time question before health data leaves the device (lib/healthConsent.ts). */
export function HealthConsentSheet() {
  const { colors } = useTheme();
  return (
    <ConsentSheet
      gate={{ useConsent: useHealthConsent, answer: answerHealthConsent }}
      icon={<Heartbeat color={colors.accent} size={26} weight="duotone" />}
      title="Back up your health data?"
      paragraphs={[
        'Weight, body measurements, meals, water and workouts are health data. With your permission, Echo stores them on its servers so they sync across your devices and can be used for coaching.',
        'If you say no, everything stays on this device only and the tools work the same. You can change this at any time in Settings → Privacy; turning it off deletes the copy on our servers.',
      ]}
      allowLabel="Allow"
      declineLabel="Keep on this device"
    />
  );
}
