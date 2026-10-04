/**
 * The name to show for a person.
 *
 * display_name is optional in the schema and empty for a fair number of real
 * accounts — anyone created through an OTP flow that never asked for a name.
 * Rendering it directly leaves a blank line where the name should be, which is
 * what "People to start with" in Explore was doing: an avatar, an empty row,
 * and a handle underneath.
 *
 * The API layer already falls back this way when it maps rows (display_name →
 * username → 'User'), so this is the same rule applied at the point of render,
 * for the many screens that read a display name straight off an object.
 *
 * Whitespace counts as empty: a name of ' ' is not a name.
 */
export function personName(person: {
  displayName?: string | null;
  username?: string | null;
} | null | undefined): string {
  const display = person?.displayName?.trim();
  if (display) return display;

  const handle = person?.username?.trim();
  if (handle) return handle;

  // Nothing to show. Better than an empty row, and it matches what the API
  // layer writes when a profile row cannot be read at all.
  return 'Someone';
}
