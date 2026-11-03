import { Alert, Linking } from 'react-native';
import { ttx } from '../i18n/i18n';
import { isSafeExternalUrl } from './urlSafety';

/**
 * Open a link that somebody else chose: a link card in a DM, the links list of
 * a chat, a tutor's meeting link.
 *
 * Linking.openURL hands any scheme to the operating system. The sender controls
 * the string, and in an end-to-end encrypted chat the server cannot check it, so
 * a message could carry upi://pay?pa=..., tel:, sms: or a custom scheme into
 * another app, behind a card that only shows a host. Only https and mailto open
 * (isSafeExternalUrl); anything else is refused, and the person is told rather
 * than left tapping a button that does nothing.
 */
export async function openExternalUrl(url: string | null | undefined): Promise<boolean> {
  if (!url || !isSafeExternalUrl(url)) {
    Alert.alert(ttx('Link not opened'), ttx('Only secure https links can be opened from here.'));
    return false;
  }
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
