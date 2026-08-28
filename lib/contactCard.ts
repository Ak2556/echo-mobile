import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Echo's entry in the phone's address book.
 *
 * The account and the sync adapter are set up natively at launch (see
 * plugins/withEchoContactCard.js). The one thing that cannot happen there is
 * the permission: WRITE_CONTACTS is a runtime grant, and asking for it
 * unprompted at startup is how an app gets a permanent "deny". So it is asked
 * for here, from a switch the user chose to touch.
 *
 * PermissionsAndroid is part of React Native, so this costs no dependency.
 */

export function contactCardSupported(): boolean {
  // Android only, and deliberately so: iOS has no supported way for an app to
  // own a row on a contact card. The iOS counterpart is App Intents.
  return Platform.OS === 'android';
}

export async function contactCardEnabled(): Promise<boolean> {
  if (!contactCardSupported()) return false;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS);
  } catch {
    return false;
  }
}

export type ContactCardResult = 'enabled' | 'denied' | 'blocked' | 'unsupported';

/**
 * Ask for the permission the contact needs.
 *
 * Granting does not make the contact appear instantly: the sync adapter is the
 * only thing allowed to write it, and it runs on Android's schedule. The next
 * launch always triggers one, which is what the caller should tell the user
 * rather than implying it is already done.
 */
export async function enableContactCard(): Promise<ContactCardResult> {
  if (!contactCardSupported()) return 'unsupported';
  try {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.WRITE_CONTACTS,
      {
        title: 'Add Echo to your contacts',
        message:
          'Echo appears in your address book so you can reach it the way you reach a person.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      },
    );
    if (result === PermissionsAndroid.RESULTS.GRANTED) return 'enabled';
    if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
    return 'denied';
  } catch {
    return 'denied';
  }
}
