# Moderation Runbook

Echo uses automated checks before public content appears in feeds. When the
moderation provider is unavailable, new public content stays hidden until the
user retries or an operator reviews the incident.

## Report Queue

User reports are stored in `public.reports` with:

- `status`: `open`, `reviewing`, `resolved`, or `dismissed`
- `reviewed_by`: operator account that handled the report
- `reviewed_at`: review completion time
- `action_taken`: short user-safe action summary
- `internal_notes`: private moderation notes

Operators review open reports from oldest to newest at least once per business
day. Reports involving threats, child safety, non-consensual sexual content, or
credible self-harm are reviewed immediately when detected.

## Standard Actions

- Hide or delete content that violates the Terms.
- Warn, suspend, or delete accounts that repeatedly violate the Terms.
- Block content from public feeds while an investigation is pending.
- Escalate child sexual abuse material and credible threats according to legal
  obligations and platform policy.

## Audit Trail

Every resolved or dismissed report must include `reviewed_at`, `reviewed_by`,
and either `action_taken` or `internal_notes`.
