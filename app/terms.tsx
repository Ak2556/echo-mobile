import React from 'react';
import { LegalDocScreen } from '../components/legal/LegalDocScreen';
import { TERMS_OF_SERVICE_MD, TERMS_UPDATED } from '../constants/legal/termsOfService';

export default function TermsOfServiceScreen() {
  return <LegalDocScreen title="Terms of Service" updated={TERMS_UPDATED} markdown={TERMS_OF_SERVICE_MD} />;
}
