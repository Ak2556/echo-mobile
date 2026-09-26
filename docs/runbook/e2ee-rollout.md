# End-to-end encrypted DMs: rollout and operations

Plan: docs/superpowers/plans/2026-09-26-dm-e2ee-phases-1-2.md

## Deploy order
The client selects the new `direct_messages` columns on every thread fetch, so the schema must be live before any build containing this work is installed.
1. `supabase db push --linked --yes` applies `20260926155000` (grant narrowing), `20260926160000` (devices, key rows, sealed send) and `20260926170000` (report disclosure), in that order. All three are additive for existing clients.
2. `supabase functions deploy push-fanout` (sealed DMs push "Sent you a message" instead of a blank body).
3. Ship the build.

## Turning it on
1. Ship the build containing this work. OTA does not reach installed builds (runtime mismatch), so it rides a store build.
2. Wait until the people who DM each other are on it. Registered devices:
   `select count(distinct user_id) from public.user_devices where revoked_at is null;`
   compared with recent DM senders:
   `select count(distinct sender_id) from public.direct_messages where created_at > now() - interval '14 days';`
3. Flip `feature_flags.e2eeSend` to `true` (dashboard or SQL). Clients pick it up within 5 minutes of foregrounding.

A device on an old build that receives a sealed message shows an empty bubble. That is why step 2 exists.

## Turning it off
Set `e2eeSend` to `false`. New messages go out as before (no lock). Every sealed message stays readable, because reading is never gated. Nothing is lost.

## Verifying a report of a sealed message
`reports.disclosed_content` is what the reporter says was written. To check it, take `disclosed_message_key` and the message row's `ciphertext`, `nonce`, `conversation_id` and `sender_id`, and call `verifyDisclosure(disclosed_content, ciphertext, nonce, disclosed_message_key, { messageId: target_id, conversationId, senderId })` from `lib/e2ee/crypto.ts` (for example from a vitest scratch file or `node --experimental-strip-types`). `true` means the sender wrote exactly that. `disclosed_context` is the reporter's account and cannot be verified.

## What may be said publicly
Accurate once `e2eeSend` is on (not before): "One-to-one text messages are end-to-end encrypted when both people use a current version of Echo; a lock shows which messages are."
Not accurate: anything about photos, voice, groups, forward secrecy, metadata, or "most secure". See the spec's last section.
