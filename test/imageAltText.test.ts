import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALT_TEXT_MAX, ALT_TEXT_MAX_COUNT } from '../lib/media/altText';

/**
 * Alt text is user-written text shown to other people, so the same rules as the
 * caption apply, and they live in SQL and in an edge function that the app's type
 * check cannot see.
 */
const migration = readFileSync('supabase/migrations/20261009120000_image_alt_text.sql', 'utf8').replace(/--.*$/gm, '');

describe('alt text is moderated like the caption', () => {
  it('editing it counts as new content in both functions that decide that', () => {
    for (const fn of ['bump_echo_content_version', 'guard_client_writes']) {
      const body = migration.slice(migration.toLowerCase().indexOf(`function public.${fn}`));
      const end = body.indexOf('$function$', body.indexOf('$function$') + 10);
      const def = body.slice(0, end);
      expect(def, fn).toMatch(/new\.media_urls, new\.media_alt\)/);
      expect(def, fn).toMatch(/old\.media_urls, old\.media_alt\)/);
    }
  });

  it('the judge reads it', () => {
    const judge = readFileSync('supabase/functions/embed-echo/judge.ts', 'utf8');
    expect(judge).toMatch(/media_alt, content_version/);
    expect(judge).toMatch(/moderationTextFor\(echoRow\)/);
  });
});

describe('the app and the database agree on the limits', () => {
  it('per-description and per-post limits match the check constraint', () => {
    expect(migration).toMatch(new RegExp(`char_length\\(a\\) > ${ALT_TEXT_MAX}\\b`));
    expect(migration).toMatch(new RegExp(`array_length\\(p, 1\\), 0\\) <= ${ALT_TEXT_MAX_COUNT}\\b`));
  });
});

describe('screen readers can use the photo viewer', () => {
  it('every control in it has a label, and the image carries the description', () => {
    const viewer = readFileSync('components/ui/ZoomableImageViewer.tsx', 'utf8');
    for (const label of ['Close photo', 'Previous photo', 'Next photo']) expect(viewer, label).toContain(`accessibilityLabel="${label}"`);
    expect(viewer).toMatch(/accessibilityLabel=\{alt\}/);
  });

  it('the feed grid reads descriptions only while a screen reader runs', () => {
    const grid = readFileSync('components/feed/MediaGrid.tsx', 'utf8');
    expect(grid).toMatch(/screenReaderEnabled && props\.echoId \? <MediaGridWithAlt/);
  });
});
