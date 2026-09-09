import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/**
 * Saving posted media to the viewer's device.
 *
 * Routed through the share sheet rather than written straight to the photo
 * library, because writing to Photos needs expo-media-library — a native module,
 * which under CNG means a new build before anyone can use the feature at all.
 * The share sheet already carries "Save Video" / "Save Image", costs the user
 * one extra tap, and works with the binary that is on the device today.
 *
 * Swapping in expo-media-library later only changes the last step here; nothing
 * that calls this needs to know.
 */

export type SaveResult = { ok: true } | { ok: false; reason: string };

/** Anything outside this set is replaced — the name reaches the filesystem. */
const UNSAFE_IN_FILENAME = /[^a-zA-Z0-9._-]/g;

function fileNameFor(uri: string): string {
  const last = uri.split('?')[0].split('#')[0].split('/').pop() || '';
  const cleaned = last.replace(UNSAFE_IN_FILENAME, '_').replace(/^\.+/, '');
  if (!cleaned) return `echo-media-${Date.now()}.mp4`;
  // A name with no extension gives the share sheet nothing to infer a type
  // from, and iOS then offers no "Save" target at all.
  return cleaned.includes('.') ? cleaned : `${cleaned}.mp4`;
}

/**
 * Download `uri` and hand it to the OS share sheet.
 *
 * Callers must check the author's `allowDownloads` first — this function
 * deliberately does not, because it has no view of who posted the media. The
 * permission belongs at the call site, where the item is in hand.
 */
export async function saveMediaToDevice(uri: string | undefined | null): Promise<SaveResult> {
  if (!uri) return { ok: false, reason: 'There is nothing to save here.' };

  // Remote http(s) only. A file:// uri is already on the device, and handing an
  // arbitrary scheme to the downloader is not something to do with a value that
  // arrived over the network.
  if (!/^https?:\/\//i.test(uri)) {
    return { ok: false, reason: 'This media cannot be saved.' };
  }
  if (Platform.OS === 'web') {
    return { ok: false, reason: 'Saving is not available on the web.' };
  }

  const dir = FileSystem.cacheDirectory;
  if (!dir) return { ok: false, reason: 'No storage is available on this device.' };

  try {
    if (!(await Sharing.isAvailableAsync())) {
      return { ok: false, reason: 'Sharing is not available on this device.' };
    }

    // Cache, not documents: a copy the user chose to keep leaves through the
    // share sheet, so holding our own copy forever would only grow unbounded.
    const { uri: localUri, status } = await FileSystem.downloadAsync(uri, `${dir}${fileNameFor(uri)}`);
    if (status !== 200) {
      return { ok: false, reason: `Download failed (${status}).` };
    }

    await Sharing.shareAsync(localUri);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : 'Could not save this media.' };
  }
}
