import * as MediaLibrary from 'expo-media-library';
import { showToast } from '../components/ui/Toast';

/**
 * Requests photo-library permission, saves one or more local URIs to the
 * camera roll, and shows a toast for success or failure.
 */
export async function saveToMediaLibrary(uris: string[]): Promise<void> {
  const { status } = await MediaLibrary.requestPermissionsAsync();
  if (status !== 'granted') {
    showToast('Permission required to save media', '🔒');
    return;
  }
  try {
    await Promise.all(uris.map(uri => MediaLibrary.saveToLibraryAsync(uri)));
    showToast(
      uris.length === 1 ? 'Saved to camera roll' : `${uris.length} items saved`,
      '✅',
    );
  } catch {
    showToast('Failed to save media', '❌');
  }
}
