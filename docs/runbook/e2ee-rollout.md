# End-to-end encrypted DMs: rollout and operations

Plan: docs/superpowers/plans/2026-09-26-dm-e2ee-phases-1-2.md

## Deploy order
The client selects the new `direct_messages` columns on every thread fetch, so the schema must be live before any build containing this work is installed.
1. `supabase db push --linked --yes` applies `20260926155000` (grant narrowing), `20260926160000` (devices, key rows, sealed send) and `20260926170000` (report disclosure), in that order. All three are additive for existing clients.
2. `supabase functions deploy push-fanout` (sealed DMs push "Sent you a message" instead of a blank body).
3. Ship the build.

## Turning it on (launch default)
1:1 E2EE is a launch requirement, so the build ships with `e2eeSend: true` compiled in (`lib/featureFlags.ts`). Group chats are out of scope.
1. Run the two-device check (plan Task 9 Step 3) on the release candidate.
2. Before the build reaches users, set the production row to match:
   `update public.feature_flags set enabled = true, updated_at = now() where key = 'e2eeSend';`
   A remote `false` overrides the compiled default, so without this the app seals only until its first flag fetch.
3. Ship the build. OTA does not reach installed builds (runtime mismatch), so it rides a store build.

Sealing only happens when the recipient has a registered device, and only this build registers one, so older builds keep receiving plaintext. The exception: a person with an old build on one device and this build on another sees empty bubbles on the old one.

## Turning it off
Set `e2eeSend` to `false`. New messages go out as before (no lock). Every sealed message stays readable, because reading is never gated. Nothing is lost.

## Verifying a report of a sealed message
`reports.disclosed_content` is what the reporter says was written. To check it, take `disclosed_message_key` and the message row's `ciphertext`, `nonce`, `conversation_id` and `sender_id`, and call `verifyDisclosure(disclosed_content, ciphertext, nonce, disclosed_message_key, { messageId: target_id, conversationId, senderId })` from `lib/e2ee/crypto.ts` (for example from a vitest scratch file or `node --experimental-strip-types`). `true` means the sender wrote exactly that. `disclosed_context` is the reporter's account and cannot be verified.

## What may be said publicly
Accurate once `e2eeSend` is on (not before): "One-to-one text messages are end-to-end encrypted when both people use a current version of Echo; a lock shows which messages are."
Not accurate: anything about photos, voice, groups, forward secrecy, metadata, or "most secure". See the spec's last section.
