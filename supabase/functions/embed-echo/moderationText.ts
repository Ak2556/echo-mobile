// The text a post is judged on.
//
// Kept apart from judge.ts, which pulls in the Supabase client and the model call,
// so the one decision that matters here (what counts as the post's words) can be
// tested on its own.
//
// Alt text is part of it. It is written by the author and read aloud to other
// people, so a description that is really an insult is still an insult. It is
// labelled so the model can tell a description from the caption.

export interface JudgedText {
  title: string | null;
  prompt: string;
  response: string;
  media_alt?: string[] | null;
}

export function moderationTextFor(row: JudgedText): string {
  const alt = (row.media_alt ?? [])
    .map((a) => (a ?? "").trim())
    .filter(Boolean)
    .map((a, i) => `Image description ${i + 1}: ${a}`);
  return [row.title, row.prompt, row.response, ...alt]
    .filter(Boolean)
    .join("\n\n");
}
