/**
 * The interests someone picks are ranking input, not decoration.
 *
 * They were written to the local store and nowhere else, so the server could
 * not rank by them: a new account fell back to the same feed a signed-out
 * visitor sees. They now go to `user_interests`, which seeds that person's
 * taste vector until they have liked enough for their behaviour to speak for
 * itself (see 20260923160000_interests_seed_taste.sql).
 */

/** Rows for `user_interests`, deduped and trimmed to what the column accepts. */
export function interestRows(userId: string, labels: readonly string[]): { user_id: string; interest: string }[] {
  if (!userId) return [];
  const seen = new Set<string>();
  const rows: { user_id: string; interest: string }[] = [];
  for (const raw of labels ?? []) {
    const interest = (raw ?? '').trim().toLowerCase();
    // The table's check constraint is 1..64 characters; anything else would
    // fail the whole insert and lose the rest of the list with it.
    if (!interest || interest.length > 64 || seen.has(interest)) continue;
    seen.add(interest);
    rows.push({ user_id: userId, interest });
  }
  return rows;
}

/** Whether the app must ask for a date of birth before letting someone in. */
export function needsDateOfBirth(ageYears: number | null | undefined): boolean {
  return ageYears === null || ageYears === undefined;
}
