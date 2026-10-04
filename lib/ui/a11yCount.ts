/** "1 comment", "4 comments", "0 followers". Screen readers used to hear only
 *  the number on count buttons ("4", "22"), or a wrong plural ("1 comments"). */
export function countLabel(n: number | null | undefined, singular: string, plural: string): string {
  const count = n ?? 0;
  return `${count} ${count === 1 ? singular : plural}`;
}
