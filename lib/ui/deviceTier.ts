import { Platform, PixelRatio, Dimensions } from 'react-native';

/**
 * A coarse guess at how much GPU work this device can absorb.
 *
 * Liquid-glass surfaces run a Skia fragment shader every frame. That is fine on a
 * recent iPhone and ruinous on the budget Android hardware most of Echo's audience
 * actually carries, so the surface tier has to be chosen rather than assumed.
 *
 * Deliberately derived from `Platform` and `Dimensions` alone. The obvious tool is
 * expo-device's year class, but that is a native module: adding it would mean a new
 * binary and a reinstall for every beta tester, which is exactly the cost this work
 * was scoped to avoid. OS version is a weaker signal than a year class, but it
 * correlates well enough for a three-bucket decision and costs nothing.
 *
 * This is a floor, not a verdict. `reportDroppedFrames` lets the running app demote
 * a device that turns out to be slower than its OS version suggested.
 */

export type DeviceTier = 'high' | 'mid' | 'low';

export interface DeviceSignals {
  os: string;
  /** Major OS version. iOS 17.4 -> 17; Android reports its API level here. */
  osVersion: number;
  /** Total pixels the GPU has to fill: width * height * scale. */
  screenPixels: number;
}

/**
 * iOS 16 shipped in 2022, so anything on it is a 2018-or-later device — all of
 * which have a GPU that handles a full-screen fragment shader comfortably.
 * Android is keyed on API level: 33 is Android 13 (2022), 28 is Android 9 (2018).
 * Below those, blur alone is already expensive and a shader is out of the question.
 */
const IOS_HIGH = 16;
const IOS_MID = 14;
const ANDROID_HIGH = 33;
const ANDROID_MID = 28;

/** Above roughly 1440p-equivalent, fill rate starts to dominate on mid hardware. */
const HEAVY_FILL_PIXELS = 3_500_000;

export function resolveDeviceTier(signals: DeviceSignals): DeviceTier {
  const { os, osVersion, screenPixels } = signals;

  // Web runs in a browser we cannot characterise; the blur path is safe everywhere.
  if (os === 'web') return 'mid';

  let tier: DeviceTier;
  if (os === 'ios') {
    tier = osVersion >= IOS_HIGH ? 'high' : osVersion >= IOS_MID ? 'mid' : 'low';
  } else if (os === 'android') {
    tier = osVersion >= ANDROID_HIGH ? 'high' : osVersion >= ANDROID_MID ? 'mid' : 'low';
  } else {
    tier = 'low';
  }

  // A big, dense panel on mid-range silicon is the classic jank combination: the
  // OS is new enough to look capable, but there are far too many pixels to shade.
  if (tier === 'mid' && screenPixels > HEAVY_FILL_PIXELS) return 'low';

  return tier;
}

function readSignals(): DeviceSignals {
  const { width, height } = Dimensions.get('window');
  const scale = PixelRatio.get();
  const raw = Platform.Version;
  // iOS reports a string like "17.4"; Android reports the API level as a number.
  const osVersion = typeof raw === 'number' ? raw : parseInt(String(raw), 10) || 0;

  return {
    os: Platform.OS,
    osVersion,
    screenPixels: Math.round(width * scale * height * scale),
  };
}

let cached: DeviceTier | null = null;
let demoted = false;

/**
 * The device's tier. Computed once — nothing here changes while the app runs, and
 * this is read on every glass surface.
 */
export function getDeviceTier(): DeviceTier {
  if (cached === null) cached = resolveDeviceTier(readSignals());
  return cached;
}

/**
 * Demote one step, permanently for this session.
 *
 * Called when a surface actually misses its frame budget. A device that says it is
 * capable but visibly stutters should stop being trusted, and the cheapest way to
 * know is to watch rather than to predict.
 */
export function demoteDeviceTier(): DeviceTier {
  const current = getDeviceTier();
  if (current === 'high') cached = 'mid';
  else if (current === 'mid') cached = 'low';
  demoted = true;
  return cached as DeviceTier;
}

export function wasDemoted(): boolean {
  return demoted;
}

/** Test seam: forget the cached tier and any demotion. */
export function resetDeviceTierCache(): void {
  cached = null;
  demoted = false;
}
