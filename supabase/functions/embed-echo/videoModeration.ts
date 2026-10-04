// Pure helpers for moderating uploaded video with Gemini's native video input.
//
// Free of Deno globals so the main vitest suite can test them; the network
// calls live in moderation.ts.
//
// Why the server fetches the file itself: Gemini accepts a video inline
// (base64, under 20 MB total request) or through the Files API (resumable
// upload, then wait for ACTIVE). A plain https mp4 URL is not accepted (only
// public YouTube links are), so the bytes have to come from R2 through here.
// Judging the file Echo actually serves, rather than frames a phone sends
// along with it, also means a modified client cannot show the classifier a
// clean picture and publish something else.
//
// Gemini samples video at roughly one frame per second, so a single-frame
// flash can slip past. That is a property of the model, not of this wiring.

/**
 * Raw bytes allowed inline. Base64 inflates by 4/3 and the 20 MB limit covers
 * the whole request, so 14 MB raw (~18.7 MB encoded) leaves room for the prompt.
 */
export const INLINE_MAX_BYTES = 14 * 1024 * 1024;

/** echo-media caps uploads at 50 MB; a little slack for a bucket limit that moves. */
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;

export type VideoRoute = "inline" | "files" | "too_large";

export function videoRoute(bytes: number): VideoRoute {
  if (!Number.isFinite(bytes) || bytes <= 0) return "files";
  if (bytes > MAX_VIDEO_BYTES) return "too_large";
  return bytes <= INLINE_MAX_BYTES ? "inline" : "files";
}

/** Anything but an explicit on is off: the safe default is today's behaviour. */
export function videoModerationEnabled(value: string | null | undefined): boolean {
  return ["on", "1", "true", "yes"].includes((value ?? "").trim().toLowerCase());
}

/** Base64 without spreading a multi-megabyte array into String.fromCharCode. */
export function toBase64(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

interface BodyInput {
  systemPrompt: string;
  mimeType: string;
}

const GENERATION_CONFIG = {
  temperature: 0,
  maxOutputTokens: 200,
  responseMimeType: "application/json",
};

function body(input: BodyInput, videoPart: Record<string, unknown>) {
  return {
    systemInstruction: { parts: [{ text: input.systemPrompt }] },
    contents: [{ role: "user", parts: [videoPart, { text: "Classify this video." }] }],
    generationConfig: GENERATION_CONFIG,
  };
}

export function inlineRequestBody(input: BodyInput & { base64: string }) {
  return body(input, { inline_data: { mime_type: input.mimeType, data: input.base64 } });
}

export function fileRequestBody(input: BodyInput & { fileUri: string }) {
  return body(input, { file_data: { mime_type: input.mimeType, file_uri: input.fileUri } });
}

/** The model's text out of a generateContent response, or "" when there is none. */
export function extractGeminiText(json: unknown): string {
  // deno-lint-ignore no-explicit-any
  const parts = (json as any)?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((p: { text?: unknown }) => (typeof p?.text === "string" ? p.text : "")).join("");
}

/**
 * Why a response has no usable verdict, when the API says so. A prompt the
 * model refuses to look at is blocked, not clean, so the caller must not
 * read an empty answer as a pass.
 */
export function blockReason(json: unknown): string | null {
  // deno-lint-ignore no-explicit-any
  const r = (json as any)?.promptFeedback?.blockReason;
  return typeof r === "string" && r ? r : null;
}
