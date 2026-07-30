import React from 'react';
import { LegalDocScreen } from '../components/legal/LegalDocScreen';
import { PRIVACY_POLICY_MD, PRIVACY_UPDATED } from '../constants/legal/privacyPolicy';

export default function PrivacyPolicyScreen() {
  return <LegalDocScreen title="Privacy Policy" updated={PRIVACY_UPDATED} markdown={PRIVACY_POLICY_MD} />;
}
