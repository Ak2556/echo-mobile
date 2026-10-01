/**
 * Parse what someone typed or pasted into a hex colour field.
 *
 * `display` is what the field shows (one leading '#', upper case, hex digits
 * only). `color` is the colour to apply, or null while the input is still
 * incomplete. Accepts #RGB shorthand.
 */
export function parseHexInput(raw: string): { display: string; color: string | null } {
  const body = raw.replace(/[^0-9a-f]/gi, '').slice(0, 6).toUpperCase();
  const display = `#${body}`;
  if (body.length === 6) return { display, color: display };
  if (body.length === 3) return { display, color: `#${[...body].map(c => c + c).join('')}` };
  return { display, color: null };
}
