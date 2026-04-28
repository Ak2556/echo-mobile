/** Matches a@b.c — rejects obvious non-addresses without being RFC-pedantic. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
