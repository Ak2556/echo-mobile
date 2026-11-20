import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { recordToolOpen } from '../../lib/mini-apps/miniAppRecents';
import { miniAppById } from '../../lib/mini-apps/miniAppCatalog';
import { remountOnLanguageChange } from '../../lib/i18n/languageScope';

const SCREEN_LAYOUT = remountOnLanguageChange();

export default function MiniAppsLayout() {
  const pathname = usePathname();

  useEffect(() => {
    const id = pathname.split('/').filter(Boolean).pop();
    if (id && miniAppById(id)) void recordToolOpen(id);
  }, [pathname]);

  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'card' }} screenLayout={SCREEN_LAYOUT} />
  );
}
