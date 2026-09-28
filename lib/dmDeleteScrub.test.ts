import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Deleting a DM must remove what it said, everywhere the database copied it.
 * The trigger is the enforcement point (no client path can skip it), so these
 * pin its contract: every content column, the key rows, and the two plaintext
 * copies outside the row.
 */
const sql = readFileSync(
  resolve(__dirname, '../supabase/migrations/20260928130000_dm_delete_scrubs_content.sql'),
  'utf8',
);

describe('DM deletion scrubs content', () => {
  it.each(['text', 'ciphertext', 'nonce', 'ephemeral_public_key', 'enc_version', 'media_url', 'voice_url', 'link_preview', 'shared_echo_id'])(
    'nulls %s',
    (col) => {
      expect(sql).toMatch(new RegExp(`new\\.${col}\\s+:= null;`));
    },
  );

  it('removes every device key and the plaintext copies outside the row', () => {
    expect(sql).toMatch(/delete from public\.direct_message_keys where message_id = new\.id/);
    expect(sql).toMatch(/update public\.dm_conversations\s+set last_message_text = null/);
    expect(sql).toMatch(/update public\.notifications\s+set preview = null/);
  });

  it('hands the media to the collector with the sender, before nulling the paths', () => {
    expect(sql).toMatch(/perform public\.jobs_enqueue\('media_gc', jsonb_build_object\(\s*'bucket', 'dm-media',\s*'sender_id', old\.sender_id,/);
    // The paths are read from OLD: by then NEW's are already null.
    expect(sql).toMatch(/jsonb_build_object\('media', old\.media_url, 'voice', old\.voice_url\)/);
  });

  it('makes deletion final and runs on every update path', () => {
    expect(sql).toMatch(/if old\.deleted_at is not null then\s+new\.deleted_at := old\.deleted_at;/);
    expect(sql).toMatch(/create trigger z_scrub_deleted_dm\s+before update on public\.direct_messages/);
  });
});
