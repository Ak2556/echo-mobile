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

/**
 * What one real chat request says about the assistant's model.
 *
 * Passes while anything answers, so a stand-in keeps the probe green, but the
 * detail names the stand-in: a retired default is a change someone should make,
 * not an outage. Fails only when nobody answered, which is what users see.
 */
export function interpretChat(
  requested: string,
  outcome: { answeredBy?: string; error?: string; fallbackReason?: string },
  ms: number,
): CheckResult {
  if (outcome.error !== undefined) {
    return { check: "chat", ok: false, detail: "no answer after " + ms + " ms: " + outcome.error.slice(0, 300) };
  }
  const want = requested.replace(/^google\//, "");
  const by = outcome.answeredBy;
  if (!by) {
    const why = outcome.fallbackReason ? ": " + outcome.fallbackReason.slice(0, 400) : "";
    return { check: "chat", ok: true, detail: "answered by OpenRouter in " + ms + " ms (Gemini did not answer" + why + ")" };
  }
  if (by !== want) return { check: "chat", ok: true, detail: want + " is retired; stand-in " + by + " answered in " + ms + " ms" };
  return { check: "chat", ok: true, detail: want + " answered in " + ms + " ms" };
}

/** Below this, a new embedding no longer lines up with the stored ones closely enough to trust search. */
export const EMBEDDING_AGREEMENT_MIN = 0.99;

/**
 * Embeddings are stored from two paths over time (OpenRouter until 2026-11-19,
 * Gemini direct since). Search compares new vectors with old ones, so the two
 * must agree. Passes while Gemini answers; fails when nothing answers, or when
 * both answer and disagree, which would silently break search and the feed.
 */
export function interpretEmbeddings(
  gemini: { vector?: number[]; error?: string },
  openRouter: { vector?: number[]; error?: string },
  similarity: (a: number[], b: number[]) => number,
  ms: number,
): CheckResult {
  const fail = (detail: string): CheckResult => ({ check: "embeddings", ok: false, detail });
  const pass = (detail: string): CheckResult => ({ check: "embeddings", ok: true, detail });
  if (!gemini.vector && !openRouter.vector) {
    return fail("no provider answered after " + ms + " ms: " + (gemini.error ?? "") + "; " + (openRouter.error ?? ""));
  }
  if (!gemini.vector) return pass("Gemini failed, OpenRouter answered (" + (gemini.error ?? "").slice(0, 200) + ")");
  if (!openRouter.vector) return pass("Gemini answered in " + ms + " ms; OpenRouter unavailable to compare");
  const c = similarity(gemini.vector, openRouter.vector);
  if (!(c >= EMBEDDING_AGREEMENT_MIN)) {
    return fail("Gemini and OpenRouter disagree (cosine " + c.toFixed(5) + "): new embeddings will not line up with stored ones");
  }
  return pass("Gemini and OpenRouter agree (cosine " + c.toFixed(5) + ") in " + ms + " ms");
}

/**
 * Every third hour, first half-hour: about eight real chat calls a day on a
 * shared quota. While the last check was degraded (failed, or only OpenRouter
 * answered) it runs every time, so a fix or a worsening shows within 30 minutes.
 */
export function chatProbeDue(now: Date, last?: { ok: boolean; detail: string } | null): boolean {
  if (last && (!last.ok || last.detail.startsWith("answered by OpenRouter"))) return true;
  return now.getUTCHours() % 3 === 0 && now.getUTCMinutes() < 30;
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

/** A job waiting longer than this means nothing is draining its queue. */
export const QUEUE_STALE_MINUTES = 10;

export interface QueueHealthRow {
  queue_name: string;
  depth: number;
  oldest_enqueued_at: string | null;
}

function ago(ms: number): string {
  const m = Math.floor(ms / 60_000);
  if (m < 60) return m + "m";
  const h = Math.floor(m / 60);
  return h < 24 ? h + "h" : Math.floor(h / 24) + "d";
}

/**
 * What the job queues say. A queue whose oldest job has waited past the limit
 * is not being drained — the job layer ran for three days on 2026-09-29 with no
 * worker secret, so the sweeper's kick returned silently every minute while
 * pushes and moderation piled up. The dead-letter queue counts too: a job
 * parked there is work that will never happen on its own.
 */
export function interpretQueues(rows: QueueHealthRow[] | null, errorMessage: string | null, now: number): CheckResult {
  if (errorMessage) return { check: "job_queues", ok: false, detail: "query failed: " + errorMessage };
  if (!rows || !rows.length) return { check: "job_queues", ok: false, detail: "no queues reported" };
  const stale: string[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r.oldest_enqueued_at || !r.depth) continue;
    const age = now - new Date(r.oldest_enqueued_at).getTime();
    if (age > QUEUE_STALE_MINUTES * 60_000) stale.push(r.queue_name + " " + r.depth + " waiting, oldest " + ago(age));
  }
  return stale.length
    ? { check: "job_queues", ok: false, detail: stale.join("; ") }
    : { check: "job_queues", ok: true, detail: rows.length + " queues draining" };
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
 * The same failures as an email, uncut. Email is the second channel because
 * push alone fails with the thing it reports on: on 2026-09-29 the push jobs
 * were themselves stuck in the queue the probe was warning about.
 */
export function alertEmail(failures: CheckResult[], ranAt: string): { subject: string; text: string } {
  return {
    subject: "Echo probe failed: " + failures.map(function (f) { return f.check; }).join(", "),
    text: failures.map(function (f) { return f.check + ": " + f.detail; }).join("\n\n") +
      "\n\nRun at " + ranAt + ". History is in public.probe_runs; this repeats every " +
      REALERT_AFTER_MINUTES / 60 + " hours while the failure lasts.",
  };
}

/** OPS_ALERT_EMAIL as a list. Anything without an @ is a typo, not a recipient. */
export function alertRecipients(raw: string | undefined): string[] {
  return (raw || "").split(",").map(function (s) { return s.trim(); }).filter(function (s) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  });
}

/**
 * Whether this run counts as having alerted. Recording an alert that reached
 * nobody starts the re-alert window anyway, so a failure whose push and email
 * both failed would stay silent for three hours instead of retrying next run.
 */
export function alertDelivered(devicesNotified: number, emailed: boolean): boolean {
  return devicesNotified > 0 || emailed;
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
