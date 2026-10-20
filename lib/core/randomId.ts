/**
 * Random numbers from the platform's cryptographic source, for ids and username suffixes.
 *
 * Math.random is fine for a shuffle, but CodeQL (rightly) flags it wherever the result ends up
 * in an identifier, since an id can be guessed from a few of its neighbours. These are not
 * secrets, but there is no reason for them to be predictable.
 */
import { getRandomValues } from 'expo-crypto';

/** An integer in [0, maxExclusive). */
export function randomInt(maxExclusive: number): number {
  const words = getRandomValues(new Uint32Array(1));
  return Math.floor((words[0] / 2 ** 32) * maxExclusive);
}

/** `length` lowercase base-36 characters. */
export function randomBase36(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += randomInt(36).toString(36);
  return out;
}
