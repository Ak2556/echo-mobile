import type { TargetMiniAppId } from '../targetCategories';

/**
 * A fact is something that happened in one mini-app, stated so another can
 * understand it. It is not an instruction — the consuming app decides what to
 * do about it, or whether to do anything at all.
 *
 * Four kinds, not twenty-two app pairs: `purchase` has three eventual emitters
 * and one consumer, so a new connection is usually a new emitter rather than a
 * new kind.
 */
export type FactKind = 'purchase' | 'timeSpent' | 'bodyStat' | 'commitment';

export interface FactPayload {
  /**
   * No currency field: the consuming app owns currency. ExpensesDoc.currency
   * is the source of truth, so an emitter cannot mislabel rupees as dollars.
   */
  purchase: { label: string; amount: number; category?: string };
  timeSpent: { label: string; minutes: number; taskId?: string };
  bodyStat: { weightKg?: number; heightCm?: number; bmi?: number };
  commitment: { label: string; due?: string; note?: string };
}

export type FactStatus = 'pending' | 'failed';

export interface Fact<K extends FactKind = FactKind> {
  id: string;
  kind: K;
  source: TargetMiniAppId;
  /** The row in the source app, so a human can trace where this came from. */
  sourceItemId: string;
  at: number;
  payload: FactPayload[K];
  attempts: number;
  status: FactStatus;
  lastError?: string;
}

/** Attempts before a fact is parked as `failed` and surfaced to the audit. */
export const MAX_FACT_ATTEMPTS = 5;
