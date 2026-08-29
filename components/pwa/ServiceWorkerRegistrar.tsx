import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Registers the service worker, once, on web.
 *
 * Renders nothing. Mounted from the root layout so registration happens
 * wherever the user lands rather than only on the home route.
 *
 * Three guards, each for a real case: Platform.OS keeps this out of the native
 * bundle entirely, `typeof window` covers the static export's server-side
 * render pass, and `'serviceWorker' in navigator` covers browsers without it
 * and any page served over plain HTTP, where the API is absent.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Registered after load so it never competes with the first paint for
    // bandwidth — the worker is for the *second* visit.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // A failed registration must never break the app; the site simply
        // stays online-only.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
