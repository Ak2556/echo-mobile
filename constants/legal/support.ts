/**
 * The Support page (rendered by app/support.tsx, public at downloadecho.com/support).
 *
 * App Store Connect requires a Support URL on the listing, and Google Play asks for a place a
 * person can ask for their account to be deleted without opening the app. Every contact comes
 * from constants/legal/entity.ts, so this page names the same people and addresses as the Terms
 * and the Privacy Policy. It makes no response-time promise: the legal ones live in the Terms
 * and on the Community Rules page.
 */
import { ENTITY_NAME, SUPPORT_EMAIL, DPO_EMAIL, GRIEVANCE_OFFICER_NAME, GRIEVANCE_OFFICER_EMAIL } from './entity';

export const SUPPORT_UPDATED = 'October 20, 2026';

export const SUPPORT_MD = `# Support

**Last updated:** ${SUPPORT_UPDATED}

Echo is made by ${ENTITY_NAME}. Write to **${SUPPORT_EMAIL}** for anything below, and tell us the email or phone number on your account so we can find it.

---

## Signing in

Echo signs you in with a one-time code sent to your email or phone, or with Google or Apple. If a code does not arrive, check spam, wait a minute and ask for a new one. If you can no longer reach the email or phone on your account, write to us from any address and we will work out how to prove the account is yours.

---

## Report something

To report a post, comment, person or message, use **Report** on it in the app. To report child sexual abuse or exploitation, pick **Child sexual abuse or exploitation** as the reason; it hides the content at once and alerts our moderators. Our standards are on the [Child Safety Standards](/legal/child-safety) page, and how we handle reports is on the [Community Rules](/legal/rules) page.

You can follow what happened to a report in **Settings → My Reports**.

---

## Delete your account

In the app: **Settings → Delete Account**. This removes your account and the content tied to it, including the photos, videos and voice you uploaded.

If you cannot open the app, write to **${SUPPORT_EMAIL}** from the email address on the account and ask for it to be deleted.

---

## Your data

Questions about the data we hold, or a request to see, correct or erase it: **${DPO_EMAIL}**. The details are in the [Privacy Policy](/privacy).

---

## Complaints

If we have not put something right, you can escalate to our Grievance Officer, ${GRIEVANCE_OFFICER_NAME}, at **${GRIEVANCE_OFFICER_EMAIL}**. The [Terms of Service](/terms) set out how a complaint is handled.
`;
