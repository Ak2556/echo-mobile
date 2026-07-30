import React from 'react';
import { LegalDocScreen } from '../../components/legal/LegalDocScreen';
import { EU_REPRESENTATIVE_MD, EU_REP_UPDATED } from '../../constants/legal/euRepresentative';

export default function EuRepresentativeScreen() {
  return <LegalDocScreen title="EU Legal Representative" updated={EU_REP_UPDATED} markdown={EU_REPRESENTATIVE_MD} />;
}
