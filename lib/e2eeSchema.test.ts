import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Pins the E2EE schema. Reads the migration text, like securityHardening.test,
 * so it runs in CI without a database. The behaviour behind each line was
 * exercised against a local Postgres copy of production (plan Task 2, Step 4).
 */
const sql = readFileSync(
  join(resolve(__dirname, '..'), 'supabase/migrations/20260926160000_e2ee_devices_and_keys.sql'),
  'utf8',
).replace(/--[^\n]*/g, '');

const has = (re: RegExp) => expect(sql).toMatch(re);

describe('user_devices', () => {
  it('has RLS on and no anon access', () => {
    has(/alter table public\.user_devices enable row level security/i);
    has(/revoke all on public\.user_devices from anon, authenticated/i);
  });
  it('lets anyone signed in read keys, and only the owner write', () => {
    has(/create policy user_devices_select on public\.user_devices\s+for select to authenticated\s+using \(true\)/i);
    has(/create policy user_devices_insert on public\.user_devices\s+for insert to authenticated\s+with check \(user_id = \(select auth\.uid\(\)\) and revoked_at is null\)/i);
    has(/create policy user_devices_update on public\.user_devices\s+for update to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\)/i);
  });
  it('never lets a public key be updated', () => {
    has(/grant update \(label, last_seen_at, revoked_at\) on public\.user_devices to authenticated/i);
    expect(sql).not.toMatch(/grant update \([^)]*public_key/i);
  });
  it('never un-revokes a device', () => {
    has(/create trigger a_keep_device_revoked/i);
  });
  it('stores keys as 32-byte hex', () => {
    has(/public_key\s+text not null check \(public_key ~ '\^\[0-9a-f\]\{64\}\$'\)/i);
  });
});

describe('direct_message_keys', () => {
  it('is readable only by the owning device, and writable only by the sender', () => {
    has(/alter table public\.direct_message_keys enable row level security/i);
    has(/revoke all on public\.direct_message_keys from anon, authenticated/i);
    has(/create policy dm_keys_select_own_device[\s\S]*?d\.user_id = \(select auth\.uid\(\)\)/i);
    has(/create policy dm_keys_insert_by_sender[\s\S]*?m\.sender_id = \(select auth\.uid\(\)\)[\s\S]*?d\.revoked_at is null/i);
  });
});

describe('direct_messages', () => {
  it('a sealed row carries no plaintext, and all its fields come together', () => {
    has(/constraint direct_messages_encryption_coherent check/i);
    has(/ciphertext is not null[\s\S]*?and text is null/i);
    has(/kind in \('text', 'link', 'contact', 'echo'\)/i);
  });
  it('the client can write the sealed columns, and edit only ciphertext and nonce', () => {
    has(/grant select \(ciphertext, nonce, ephemeral_public_key, enc_version\) on public\.direct_messages to authenticated/i);
    has(/grant update \(ciphertext, nonce\) on public\.direct_messages to authenticated/i);
  });
});

describe('send_encrypted_dm', () => {
  it('runs as the caller, so RLS and triggers apply, and inserts message and keys together', () => {
    has(/create or replace function public\.send_encrypted_dm\(p_message jsonb, p_keys jsonb\)[\s\S]*?security invoker/i);
    has(/insert into public\.direct_messages[\s\S]*?insert into public\.direct_message_keys/i);
  });
  it('refuses group conversations and empty key sets', () => {
    has(/group conversations are not end-to-end encrypted/i);
    has(/an encrypted message needs at least one key/i);
  });
  it('is not callable anonymously', () => {
    has(/revoke all on function public\.send_encrypted_dm\(jsonb, jsonb\) from public, anon/i);
    has(/grant execute on function public\.send_encrypted_dm\(jsonb, jsonb\) to authenticated/i);
  });
});

describe('server-side previews', () => {
  it('never copies a sealed message into the conversation list or a push', () => {
    has(/create or replace function public\.fn_sync_conv_last_message\(\)[\s\S]*?when new\.ciphertext is not null then null/i);
    has(/create or replace function public\.fn_dm_push_notify\(\)[\s\S]*?when new\.ciphertext is not null then null/i);
  });
});

describe('kill switch', () => {
  it('ships with encrypted sending off', () => {
    has(/insert into public\.feature_flags \(key, enabled, note\)\s+values \('e2eeSend', false,/i);
  });
});
