import { describe, expect, it } from 'vitest';
import { resolveDeviceTier, type DeviceSignals } from './deviceTier';

const MODEST_PANEL = 1_000_000;

function signals(over: Partial<DeviceSignals> = {}): DeviceSignals {
  return { os: 'ios', osVersion: 17, screenPixels: MODEST_PANEL, ...over };
}

describe('resolveDeviceTier', () => {
  it('puts a recent iPhone on the shader tier', () => {
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 17 }))).toBe('high');
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 16 }))).toBe('high');
  });

  it('steps an older iPhone down to blur', () => {
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 15 }))).toBe('mid');
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 14 }))).toBe('mid');
  });

  it('drops a pre-iOS-14 device to solid fills', () => {
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 13 }))).toBe('low');
  });

  it('reads the Android API level, not a marketing version', () => {
    // Platform.Version is the API level on Android: 34 is Android 14, 26 is 8.0.
    expect(resolveDeviceTier(signals({ os: 'android', osVersion: 34 }))).toBe('high');
    expect(resolveDeviceTier(signals({ os: 'android', osVersion: 30 }))).toBe('mid');
    expect(resolveDeviceTier(signals({ os: 'android', osVersion: 26 }))).toBe('low');
  });

  it('demotes a mid device driving too many pixels', () => {
    // The jank combination: new enough OS to look capable, far too much to shade.
    expect(
      resolveDeviceTier(signals({ os: 'android', osVersion: 30, screenPixels: 4_000_000 })),
    ).toBe('low');
  });

  it('does not punish a high-tier device for a dense panel', () => {
    expect(
      resolveDeviceTier(signals({ os: 'ios', osVersion: 17, screenPixels: 4_000_000 })),
    ).toBe('high');
  });

  it('gives web the blur path, since the browser cannot be characterised', () => {
    expect(resolveDeviceTier(signals({ os: 'web', osVersion: 0 }))).toBe('mid');
  });

  it('treats an unknown platform as the weakest', () => {
    expect(resolveDeviceTier(signals({ os: 'windows', osVersion: 11 }))).toBe('low');
  });

  it('survives an unparseable OS version rather than throwing', () => {
    expect(resolveDeviceTier(signals({ os: 'ios', osVersion: 0 }))).toBe('low');
  });
});
