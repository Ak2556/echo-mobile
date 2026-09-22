import React from 'react';
import { LegalDocScreen } from '../../components/legal/LegalDocScreen';
import { CHILD_SAFETY_MD, CHILD_SAFETY_UPDATED } from '../../constants/legal/childSafety';
import { ttx } from '../../src/shared/lib/i18n';

export default function ChildSafetyScreen() {
  return <LegalDocScreen title={ttx("Child Safety Standards")} updated={CHILD_SAFETY_UPDATED} markdown={CHILD_SAFETY_MD} />;
}
