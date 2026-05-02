// Best-effort online detection. Tries @react-native-community/netinfo if
// available; falls back to navigator.onLine on web; defaults online otherwise.

import { useEffect, useState } from 'react';

export function useNetwork(): { online: boolean } {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const NetInfo = require('@react-native-community/netinfo')?.default;
      if (NetInfo?.addEventListener) {
        const sub = NetInfo.addEventListener((state: { isConnected?: boolean | null }) => {
          setOnline(state.isConnected !== false);
        });
        cleanup = () => sub?.();
        return cleanup;
      }
    } catch {}
    if (typeof window !== 'undefined' && 'onLine' in (navigator || {})) {
      const update = () => setOnline(navigator.onLine);
      window.addEventListener('online', update);
      window.addEventListener('offline', update);
      update();
      cleanup = () => {
        window.removeEventListener('online', update);
        window.removeEventListener('offline', update);
      };
    }
    return cleanup;
  }, []);

  return { online };
}
