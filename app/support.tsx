import React from 'react';
import { LegalDocScreen } from '../components/legal/LegalDocScreen';
import { SUPPORT_MD, SUPPORT_UPDATED } from '../constants/legal/support';
import { ttx } from '../lib/i18n/i18n';

export default function SupportScreen() {
  return <LegalDocScreen title={ttx("Support")} updated={SUPPORT_UPDATED} markdown={SUPPORT_MD} />;
}
