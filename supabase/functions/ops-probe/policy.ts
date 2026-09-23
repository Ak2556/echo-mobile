// The probe's decisions, separated from its I/O so every branch can be tested.
//
// index.ts does the talking — to the model, to Postgres, to Expo — and asks
// this file what the answers mean and whether anyone should be woken up.

export interface CheckResult {
  check: string;
  ok: boolean;
  detail: string;
}

export interface ProbeRunRow {
  ok: boolean;
  alerted: boolean;
  ran_at: string;
}

/** A post with no verdict this long after it was written is stuck, not pending. */
export const STUCK_AFTER_MINUTES = 20;
/** Older than this and the sweep has given up anyway; counting it twice adds nothing. */
export const STUCK_WINDOW_HOURS = 24;
/** Keep a failing check from pushing every half hour once it is known. */
export const REALERT_AFTER_MINUTES = 180;
/** Expo shows roughly this much of a body on a lock screen. */
export const ALERT_BODY_LIMIT = 170;

/** The window of posts the stuck check considers: old enough to be late, recent enough to still matter. */
export function stuckWindow(now: number): { since: string; before: string } {
  return {
    since: new Date(now - STUCK_WINDOW_HOURS * 3600_000).toISOString(),
    before: new Date(now - STUCK_AFTER_MINUTES * 60_000).toISOString(),
  };
}

/**
 * What a moderation verdict says about the system.
 *
 * The probe classifies deliberately ordinary text, so "safe" is the expected
 * answer. An unavailable classifier is an outage; a flag on that sentence means
 * the gate in front of every published post is not behaving as configured.
 */
export function interpretModeration(
  verdict: { ok: boolean; categories: string[]; error?: string },
  ms: number,
): CheckResult {
  if (verdict.ok) return { check: "moderation", ok: true, detail: "verdict in " + ms + " ms" };
  if (verdict.categories.indexOf("moderation_unavailable") !== -1) {
    return { check: "moderation", ok: false, detail: "unavailable after " + ms + " ms: " + (verdict.error || "no detail") };
  }
  return { check: "moderation", ok: false, detail: "benign text flagged as " + verdict.categories.join(", ") };
}

/** What the stuck-post count says. A failed count is itself a failure: unknown is not healthy. */
export function interpretStuck(count: number | null, errorMessage?: string | null): CheckResult {
  if (errorMessage) return { check: "stuck_posts", ok: false, detail: "query failed: " + errorMessage };
  const n = count === null || count === undefined || count < 0 ? 0 : count;
  return {
    check: "stuck_posts",
    ok: n === 0,
    detail: n === 0
      ? "no post waiting on a verdict"
      : n + " post(s) hidden with no verdict for over " + STUCK_AFTER_MINUTES + " min",
  };
}

/**
 * Alert on the way into failure, then stay quiet.
 *
 * `rows` is this check's history, newest first. A first-ever failure alerts, a
 * failure right after a healthy run alerts, and a failure that is already known
 * waits out the re-alert window so a broken system does not push every half
 * hour for a day.
 */
export function shouldAlert(rows: ProbeRunRow[], now: number): boolean {
  const previous = rows && rows.length ? rows[0] : null;
  if (!previous) return true;
  if (previous.ok) return true;
  let lastAlert: ProbeRunRow | null = null;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].alerted) { lastAlert = rows[i]; break; }
  }
  if (!lastAlert) return true;
  return now - new Date(lastAlert.ran_at).getTime() > REALERT_AFTER_MINUTES * 60_000;
}

/** One line for a lock screen: what broke, in the order it was checked. */
export function alertBody(failures: CheckResult[]): string {
  return failures.map(function (f) { return f.check + ": " + f.detail; }).join(" · ").slice(0, ALERT_BODY_LIMIT);
}

/**
 * Always HTTP 200, with the verdict in the body.
 *
 * Returning 503 on a failing check seemed more honest until it was tested:
 * pg_net logs every non-2xx response, and cron_health counts those as failures
 * for two hours. So a probe that correctly reported a five-minute outage kept
 * cron_health red for two hours afterwards — an alarm about the alarm, long
 * after the incident was over. The truth lives in probe_runs, which cron_health
 * already reads, and in this body.
 */
export function overallStatus(results: CheckResult[]): { ok: boolean; status: number; failures: CheckResult[] } {
  const failures = results.filter(function (r) { return !r.ok; });
  return { ok: failures.length === 0, status: 200, failures: failures };
}
