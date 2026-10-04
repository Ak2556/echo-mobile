// Parse a moderation classifier's JSON verdict. Kept free of Deno globals so
// the main vitest suite can import it (moderation.ts reads Deno.env at import).

export interface Verdict {
  flagged: boolean;
  categories: string[];
}

/**
 * Parse the classifier's JSON verdict defensively. Models sometimes wrap JSON
 * in markdown fences or add stray text, so we extract the first {...} block.
 * Returns null when no valid verdict can be recovered; callers treat that as
 * "moderation unavailable" (leave pending, retry), never as a pass.
 */
export function parseVerdict(content: string): Verdict | null {
  if (!content) return null;
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    const obj = JSON.parse(content.slice(start, end + 1));
    const flagged = obj?.flagged === true;
    const categories = Array.isArray(obj?.categories)
      ? obj.categories.filter((c: unknown): c is string => typeof c === "string")
      : [];
    return { flagged, categories };
  } catch {
    return null;
  }
}
