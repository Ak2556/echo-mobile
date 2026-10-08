/**
 * Whether the Follow requests screen should show its loading state instead of
 * the empty one.
 *
 * The list is cached between visits, so a visit that follows an empty one opens
 * on an empty list that the screen has not yet checked. Showing "No requests
 * right now" there is a claim, and a wrong one when someone has asked since:
 * on the emulator it stayed up for several seconds before the real list landed.
 *
 * "Not yet checked this visit" is when the data is older than the visit and a
 * fetch is running. Answering a request writes the list (setQueryData), which
 * stamps it newer than the visit, so emptying the list yourself shows the empty
 * state at once and never the loader.
 */
export function listIsCatchingUp(
  query: { isFetching: boolean; dataUpdatedAt: number },
  itemCount: number,
  visitStartedAt: number,
): boolean {
  return itemCount === 0 && query.isFetching && query.dataUpdatedAt < visitStartedAt;
}
