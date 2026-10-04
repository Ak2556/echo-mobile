import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * The local EchoMedia module (modules/echo-media): lossless video trimming and
 * saving to the gallery, Android only. `requireOptional` rather than `require`,
 * because a build made before the module existed, and every iOS build, has no
 * such native module — callers check `canTrimVideo` / `canSaveToGallery` and
 * fall back to the system pickers and the share sheet.
 */
interface EchoMediaNative {
  trimVideo(uri: string, startMs: number, endMs: number): Promise<string>;
  saveToGallery(uri: string, mimeType: string): Promise<string>;
  videoDurationMs(uri: string): Promise<number>;
  frameAt(uri: string, ms: number, maxWidth: number): Promise<string>;
}

const native: EchoMediaNative | null =
  Platform.OS === 'android' ? requireOptionalNativeModule<EchoMediaNative>('EchoMedia') : null;

export const canTrimVideo = (): boolean => native !== null;
export const canSaveToGallery = (): boolean => native !== null;

export async function trimVideo(uri: string, startMs: number, endMs: number): Promise<string> {
  if (!native) throw new Error('Video trimming is not available in this build');
  return native.trimVideo(uri, startMs, endMs);
}

export async function videoDurationMs(uri: string): Promise<number> {
  if (!native) throw new Error('Reading video length is not available in this build');
  return native.videoDurationMs(uri);
}

export async function frameAt(uri: string, ms: number, maxWidth: number): Promise<string> {
  if (!native) throw new Error('Reading video frames is not available in this build');
  return native.frameAt(uri, ms, maxWidth);
}

export async function saveToGallery(uri: string, mimeType: string): Promise<string> {
  if (!native) throw new Error('Saving to the gallery is not available in this build');
  return native.saveToGallery(uri, mimeType);
}

/** A human line for the error codes the module throws. */
export function mediaErrorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  switch (code) {
    case 'ERR_UNSUPPORTED_ANDROID':
      return 'Saving to the gallery needs Android 10 or newer. Use Share instead.';
    case 'ERR_UNSUPPORTED_FORMAT':
      return 'This video format cannot be trimmed on this device.';
    case 'ERR_TRIM_RANGE':
      return 'Pick a longer section to keep.';
    default:
      return (e as Error)?.message || 'Something went wrong.';
  }
}
