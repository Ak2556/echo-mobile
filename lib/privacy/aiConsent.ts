/**
 * Permission to send personal data to a third-party AI (Google Gemini).
 *
 * App Store guideline 5.1.2(i) (November 2025) requires an app to say clearly
 * where personal data goes when it is shared with a third-party AI, and to get
 * explicit permission first. Echo's chat, voice commands, editorial rewrites
 * and mini-app coaching all send what the user gives them to Gemini, so each
 * of those calls ensureAiConsent() before sending anything.
 *
 * Asked once per install, at the moment of first use, so the question arrives
 * with its context. Withdrawn from Settings → Privacy. Declining never breaks
 * anything else in the app; it only stops the AI features.
 *
 * Not covered here, and disclosed in the privacy policy instead: moderation
 * of posts about to be published (a safety function every post goes through),
 * and face checks for the verified badge (which have their own consent step).
 */

import { createConsentGate } from './consentGate';

const gate = createConsentGate('ai:dataConsent', { rememberRefusal: false });

/** The consent store: `answer` is 'granted' | 'declined' | 'undecided'. */
export const useAiConsent = gate.useConsent;

export const AI_CONSENT_DECLINED_MESSAGE =
  "AI features are off because you chose not to share data with Google's AI. You can turn them on in Settings → Privacy.";

/**
 * Resolves true when the user has allowed AI data sharing, asking first if they
 * have not. A refusal is not remembered: the next use asks again, because the
 * feature cannot work any other way.
 */
export const ensureAiConsent = gate.ensure;

/** Called by the sheet. */
export const answerAiConsent = gate.answer;

/** Throws the user-facing message when consent is refused. For API helpers. */
export async function requireAiConsent(): Promise<void> {
  if (!(await ensureAiConsent())) throw new Error(AI_CONSENT_DECLINED_MESSAGE);
}
