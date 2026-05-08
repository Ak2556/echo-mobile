# Testing Guide

Testing should match the risk of the change. Small documentation changes need lightweight validation. Shared utility, auth, database, AI, and deployment changes need broader checks.

## Core Checks

Run before most PRs:

```bash
npm run lint
npm run typecheck
npm test
```

These match the current CI workflow.

## Install Check

Use a clean install when dependency files change:

```bash
npm ci
```

Do not hand-edit `package-lock.json` without running an install command.

## Backend Checks

For backend-only changes:

```bash
cd backend
python -m compileall main.py db/supabase.py
```

If backend tests are added later, document and run them from this guide.

## Area-Specific Manual Checks

| Area | Manual verification |
| --- | --- |
| Auth | Sign in, sign out, password reset, OAuth/deep-link callback, and app restart state. |
| Feed/social | Load feed, like, comment, repost, bookmark, profile navigation, fallback behavior. |
| AI chat | Start stream, abort stream, retry after failure, publish exchange, model fallback. |
| Messaging | Conversation list, open thread, send message, unread count. |
| Notifications | Fetch notifications, mark read, badge behavior. |
| Mini-apps | Open touched mini-app, enter data, persist state if expected. |
| Database | Apply migration to staging/local project, verify RLS and rollback plan. |
| Deployment | Confirm target environment, secrets, build profile, and rollback path. |

## Reporting Failures

Separate failures into:

- New failure caused by this change.
- Pre-existing failure present on the unchanged baseline.
- Skipped check with a concrete reason.

Never claim launch readiness while required checks are failing.
