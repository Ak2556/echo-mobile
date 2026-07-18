import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMiniAppMediaUrl } from './miniAppMedia';
import { pullMiniAppIfNewer, pushMiniApp } from './miniAppSync';

export const CAMERA_CAPTURES_KEY = 'mini:camera';

export type CameraCaptureType = 'photo' | 'video';

export interface CameraCapture {
  id: string;
  uri: string;
  type: CameraCaptureType;
  intent?: string;
  width?: number;
  height?: number;
  storagePath?: string;
  createdAt: string;
}

function normalizeCaptures(raw: unknown): CameraCapture[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Partial<CameraCapture> => !!item && typeof item === 'object')
    .map((item): CameraCapture => {
      const type: CameraCaptureType = item.type === 'video' ? 'video' : 'photo';
      return {
        id: typeof item.id === 'string' && item.id ? item.id : `${Date.now()}`,
        uri: typeof item.uri === 'string' ? item.uri : '',
        type,
        intent: typeof item.intent === 'string' && item.intent ? item.intent : undefined,
        width: typeof item.width === 'number' ? item.width : undefined,
        height: typeof item.height === 'number' ? item.height : undefined,
        storagePath: typeof item.storagePath === 'string' && item.storagePath ? item.storagePath : undefined,
        createdAt: typeof item.createdAt === 'string' && item.createdAt ? item.createdAt : new Date().toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function hydrateSignedUrls(captures: CameraCapture[]): Promise<CameraCapture[]> {
  return Promise.all(captures.map(async capture => {
    const signed = await getMiniAppMediaUrl(capture.storagePath);
    return signed ? { ...capture, uri: signed } : capture;
  }));
}

export async function loadCameraCaptures(): Promise<CameraCapture[]> {
  const remote = await pullMiniAppIfNewer('camera');
  if (Array.isArray(remote)) {
    const captures = normalizeCaptures(remote);
    await AsyncStorage.setItem(CAMERA_CAPTURES_KEY, JSON.stringify(captures));
    return hydrateSignedUrls(captures);
  }
  try {
    return hydrateSignedUrls(normalizeCaptures(JSON.parse((await AsyncStorage.getItem(CAMERA_CAPTURES_KEY)) ?? '[]')));
  } catch {
    return [];
  }
}

export async function saveCameraCaptures(captures: CameraCapture[]): Promise<void> {
  const next = normalizeCaptures(captures);
  await AsyncStorage.setItem(CAMERA_CAPTURES_KEY, JSON.stringify(next));
  pushMiniApp('camera', next);
}
