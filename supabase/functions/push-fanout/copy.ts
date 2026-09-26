// Pure, so vitest can test it; index.ts imports from esm.sh and cannot load under node.

/** A sealed DM reaches the server with no preview; the push must still say something. */
export function dmPushBody(preview?: string | null): string {
  const text = preview?.trim();
  return text ? text.slice(0, 140) : 'Sent you a message';
}
