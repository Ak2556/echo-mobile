import React from 'react';
import { LegalDocScreen } from '../components/legal/LegalDocScreen';
import { PRIVACY_POLICY_MD, PRIVACY_UPDATED } from '../constants/legal/privacyPolicy';
import { ttx } from '../src/shared/lib/i18n';

export default function PrivacyPolicyScreen() {
  return <LegalDocScreen title={ttx("Privacy Policy")} updated={PRIVACY_UPDATED} markdown={PRIVACY_POLICY_MD} />;
}
