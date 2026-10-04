import { useEffect } from 'react';
import { Stack, usePathname } from 'expo-router';
import { recordToolOpen } from '../../lib/mini-apps/miniAppRecents';
import { miniAppById } from '../../lib/mini-apps/miniAppCatalog';

export default function MiniAppsLayout() {
  const pathname = usePathname();

  useEffect(() => {
    const id = pathname.split('/').filter(Boolean).pop();
    if (id && miniAppById(id)) void recordToolOpen(id);
  }, [pathname]);

  return (
    <Stack screenOptions={{ headerShown: false, presentation: 'card' }} />
  );
}
