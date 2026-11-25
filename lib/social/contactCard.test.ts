import { describe, expect, it, vi } from 'vitest';

const rn = vi.hoisted(() => ({ Platform: { OS: 'android' }, PermissionsAndroid: {} }));
vi.mock('react-native', () => rn);
vi.mock('expo-constants', () => ({ default: { expoConfig: null } }));

import { contactCardSupported } from './contactCard';

// 2026-11-25: the store build blocks WRITE_CONTACTS (app.json blockedPermissions),
// so Android refuses the request at once and the "in Contacts" switch could never
// turn on. A switch that cannot work is hidden instead.
describe('contactCardSupported', () => {
  const config = (blocked: string[]) => ({ android: { blockedPermissions: blocked } });

  it('is offered on Android when the build declares the permission', () => {
    expect(contactCardSupported(config([]) as never)).toBe(true);
    expect(contactCardSupported(null)).toBe(true);
  });

  it('is hidden when the build blocks WRITE_CONTACTS', () => {
    expect(contactCardSupported(config(['android.permission.WRITE_CONTACTS']) as never)).toBe(false);
  });

  it('is never offered on iOS', () => {
    rn.Platform.OS = 'ios';
    expect(contactCardSupported(config([]) as never)).toBe(false);
    rn.Platform.OS = 'android';
  });
});
