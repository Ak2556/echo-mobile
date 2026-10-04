/**
 * Permission to store body and health data on Echo's servers.
 *
 * The Fitness mini-app (and BMI's "apply to Fitness") records weight, body
 * measurements, meals, water and workouts. Under India's SPDI Rules 2011,
 * which govern until the DPDP Act fully commences, physical and physiological
 * health data is sensitive personal data and needs explicit consent before it
 * is collected. It is also what powers cross-device sync and fitness coaching.
 *
 * So: the data is always saved on the device, and is uploaded only after the
 * user says yes. Asked at the first save. "No" is remembered — the tools keep
 * working, on this device only. Settings → Privacy changes it; turning it off
 * deletes the server copy.
 */

import { createConsentGate } from './consentGate';

const gate = createConsentGate('health:dataConsent', { rememberRefusal: true });

export const useHealthConsent = gate.useConsent;
export const ensureHealthConsent = gate.ensure;
export const answerHealthConsent = gate.answer;

/** True only when already granted. Never asks — for background paths. */
export function hasHealthConsent(): boolean {
  return useHealthConsent.getState().answer === 'granted';
}
