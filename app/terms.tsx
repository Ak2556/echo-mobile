import React from 'react';
import { LegalDocScreen } from '../components/legal/LegalDocScreen';
import { TERMS_OF_SERVICE_MD, TERMS_UPDATED } from '../constants/legal/termsOfService';
import { ttx } from '../lib/i18n';

export default function TermsOfServiceScreen() {
  return <LegalDocScreen title={ttx("Terms of Service")} updated={TERMS_UPDATED} markdown={TERMS_OF_SERVICE_MD} />;
}
