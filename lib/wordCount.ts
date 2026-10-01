/** Words in a Markdown draft. Bare syntax tokens (`#`, `-`, `>`, `**`, `1.`) are not words. */
export function countWords(text: string): number {
  return text.split(/\s+/).filter(w => /[^#*_\-`>~|[\]()!+=.\d]/.test(w) || /^\d+$/.test(w)).length;
}
