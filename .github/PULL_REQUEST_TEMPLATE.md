## What and why

<!-- What changes, and the reason. Explain why, not only what: the diff already shows what. -->

## Checks

- [ ] `npm run lint`, `npm run typecheck` and `npm test` pass locally (CI runs all three)
- [ ] Tests added or updated for any behaviour change
- [ ] No secrets, `.env` files, build output or local paths are staged

<details>
<summary>If this touches the database (<code>supabase/migrations/</code>)</summary>

- [ ] Run against the **live** schema inside a transaction that always rolls back, and the result is pasted below
- [ ] RLS still covers every affected table, and a new table has the grants its client needs (none by default)
- [ ] A client `upsert` has an INSERT **and** an UPDATE policy
- [ ] Policies use `(select auth.uid())`, not a bare `auth.uid()`
- [ ] Anything that takes an identity argument checks `auth.uid()` instead of trusting it
- [ ] Old builds still work against it, or the breaking step is gated and says what must happen first

</details>

<details>
<summary>If this changes what ships to phones</summary>

- [ ] JavaScript only (reaches users by OTA), or native (needs a build): say which
- [ ] A new Phosphor icon import: ran `node scripts/gen-icon-shim.mjs`
- [ ] A new screen has a voice phrase; a new multiline field has a dictation handler
- [ ] Screenshots or a recording attached for any visible change

</details>

## Unverified

<!-- What you did NOT check, and what could still be wrong. "Nothing" is rarely true. -->
