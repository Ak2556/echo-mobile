/**
 * Report reasons. Stored verbatim in reports.reason, so they stay English; the
 * report screen shows them translated.
 *
 * The urgent ones hide a reported echo at once and alert every moderator.
 * India's IT Rules (as amended in 2026) give 2 hours to act on complaints about
 * nudity, sexual content, impersonation and morphed images, which a solo
 * operator cannot promise around the clock. The server decides urgency in
 * public.report_reason_is_urgent(); reportReasons.test.ts fails if the two
 * lists drift.
 */
export const URGENT_REPORT_REASONS: readonly string[] = [
  'Child sexual abuse or exploitation',
  'Intimate images of me shared without consent',
  'Sexual content or nudity',
  'Impersonation',
];

export const REPORT_REASONS: readonly string[] = [
  ...URGENT_REPORT_REASONS,
  'Harassment or bullying',
  'Hate speech',
  'Violence or threats',
  'Spam or misleading',
  'Inappropriate content',
  'Other',
];
