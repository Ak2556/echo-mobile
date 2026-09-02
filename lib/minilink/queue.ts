import { persistGet, persistSet } from '../../store/persist';
import { uuidv4 } from '../../store/outbox';
import type { TargetMiniAppId } from '../targetCategories';
import { MAX_FACT_ATTEMPTS, type Fact, type FactKind, type FactPayload } from './types';

const KEY = 'minilink_facts_v1';

function read(): Fact[] {
  return persistGet<Fact[]>(KEY, []);
}

function write(facts: Fact[]): void {
  persistSet(KEY, facts);
}

/** Reject a payload that cannot produce a sane row downstream. */
function isValid<K extends FactKind>(kind: K, payload: FactPayload[K]): boolean {
  if (!payload || typeof payload !== 'object') return false;
  if (kind === 'purchase') {
    const p = payload as FactPayload['purchase'];
    return typeof p.label === 'string' && p.label.length > 0 && Number.isFinite(p.amount);
  }
  if (kind === 'timeSpent') {
    const p = payload as FactPayload['timeSpent'];
    return Number.isFinite(p.minutes);
  }
  return true;
}

/**
 * Record that something happened. Fire-and-forget by contract: this must never
 * throw into the emitting app's UI and never block its save, so every failure
 * path returns null instead of raising.
 */
export function emit<K extends FactKind>(
  kind: K,
  source: TargetMiniAppId,
  sourceItemId: string,
  payload: FactPayload[K],
): Fact<K> | null {
  try {
    if (!isValid(kind, payload)) return null;
    const fact: Fact<K> = {
      id: uuidv4(),
      kind,
      source,
      sourceItemId,
      at: Date.now(),
      payload,
      attempts: 0,
      status: 'pending',
    };
    write([...read(), fact as Fact]);
    return fact;
  } catch {
    return null;
  }
}

export function listPending(): Fact[] {
  return read().filter((f) => f.status === 'pending');
}

export function listFailed(): Fact[] {
  return read().filter((f) => f.status === 'failed');
}

export function removeFact(id: string): void {
  write(read().filter((f) => f.id !== id));
}

export function markFailure(id: string, error: string): void {
  write(
    read().map((f) => {
      if (f.id !== id) return f;
      const attempts = f.attempts + 1;
      return {
        ...f,
        attempts,
        lastError: error,
        status: attempts >= MAX_FACT_ATTEMPTS ? 'failed' : 'pending',
      };
    }),
  );
}

/** Test seam only. */
export function resetQueue(): void {
  write([]);
}
