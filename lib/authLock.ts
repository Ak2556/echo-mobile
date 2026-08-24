import { Platform } from 'react-native';
import { navigatorLock, processLock } from '@supabase/supabase-js';

/**
 * Serializes supabase-js auth operations, above all token refresh.
 *
 * Without a real lock, two refreshes can run at once — which happens routinely
 * when the app returns from the background and both the AppState listener and
 * an in-flight request notice the token is stale. The second refresh presents
 * a refresh token the first has already rotated away, the server rejects it,
 * and the user is signed out with no explanation.
 *
 * This was previously `async (_name, _timeout, fn) => fn()`: the right shape,
 * no mutual exclusion. It type-checked, so the gap was invisible.
 *
 * `processLock` is a promise-chained mutex inside this JS context, which is
 * what React Native needs — there is one JS runtime and no other tab to
 * coordinate with. On web, `navigatorLock` uses the Web Locks API so that two
 * open tabs also serialize against each other; it is only chosen where that API
 * actually exists, since Expo's static web render runs in Node.
 */
const supportsNavigatorLock =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && 'locks' in navigator;

export const authLock = supportsNavigatorLock ? navigatorLock : processLock;
