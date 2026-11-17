import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The backup workflow runs on a schedule and only says anything when it fails, so the properties that
 * make a backup trustworthy are pinned here: complete (compared to the live database), encrypted
 * before upload, and never uploaded in the clear.
 */
const yml = readFileSync(join(__dirname, '..', '.github/workflows/db-backup.yml'), 'utf8');
const at = (needle: string) => yml.indexOf(needle);

describe('db-backup workflow', () => {
  it('counts the live database before it dumps, and checks the restore against those counts', () => {
    expect(at('- name: Count live rows')).toBeGreaterThan(-1);
    expect(at('- name: Count live rows')).toBeLessThan(at('- name: Dump'));
    expect(yml).toContain('./scripts/check-restored-counts.sh live-counts.txt');
    expect(yml).toMatch(/auth\.users/);
  });

  it('checks out the repository, because the count check is a script in it', () => {
    expect(yml).toMatch(/uses: actions\/checkout@v4/);
    expect(at('actions/checkout')).toBeLessThan(at('- name: Check configuration'));
  });

  it('encrypts after the restore check and before the upload', () => {
    const restore = at('- name: Prove the dump restores');
    const encrypt = at('- name: Encrypt');
    const upload = at('- name: Upload to R2');
    expect(restore).toBeGreaterThan(-1);
    expect(encrypt).toBeGreaterThan(restore);
    expect(upload).toBeGreaterThan(encrypt);
  });

  it('uploads only the encrypted file and the counts, never the plaintext dump', () => {
    expect(yml).toContain('aws s3 cp "$ENCRYPTED"');
    expect(yml).toContain('aws s3 cp "$COUNTS"');
    expect(yml).not.toMatch(/aws s3 cp "\$NAME"/);
    expect(yml).toMatch(/rm -f "\$NAME"/);
  });

  it('is not ready without the age public key, and refuses a private key pasted in its place', () => {
    expect(yml).toMatch(/BACKUP_AGE_PUBLIC_KEY: \$\{\{ secrets\.BACKUP_AGE_PUBLIC_KEY \}\}/);
    expect(yml).toMatch(/missing="\$missing BACKUP_AGE_PUBLIC_KEY"/);
    expect(yml).toContain("grep -Eq '^age1[a-z0-9]{50,}$'");
    expect(yml).not.toMatch(/AGE-SECRET-KEY-1[A-Z0-9]{20,}/);
  });

  it('prunes encrypted dumps and their counts after 30 days, not just old plain ones', () => {
    expect(yml).toMatch(/sql\\\.gz\\\.age/);
    expect(yml).toMatch(/counts\\\.txt/);
  });

  it('keeps the unconfigured-issue behaviour, so no backup is never silent', () => {
    expect(yml).toContain('Database backups are not configured');
    expect(yml).toMatch(/steps\.config\.outputs\.ready != 'true'/);
  });
});
