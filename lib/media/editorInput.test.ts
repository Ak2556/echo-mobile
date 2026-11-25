import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDITOR_MAX_EDGE, editingResize } from './editorInput';

describe('editingResize', () => {
  it('scales a camera original down on its longest edge', () => {
    expect(editingResize(4032, 3024)).toEqual({ resize: { width: EDITOR_MAX_EDGE } });
    expect(editingResize(3024, 4032)).toEqual({ resize: { height: EDITOR_MAX_EDGE } });
    expect(editingResize(8064, 6048)).toEqual({ resize: { width: EDITOR_MAX_EDGE } });
  });

  it('leaves a photo that already fits alone', () => {
    expect(editingResize(960, 1280)).toBeNull();
    expect(editingResize(2048, 1536)).toBeNull();
    expect(editingResize(0, 0)).toBeNull();
  });
});

// 2026-11-25, iPhone: a HEIC from the picker left the editor on a spinner forever.
describe('PhotoEditor input', () => {
  const src = readFileSync('components/feed/PhotoEditor.tsx', 'utf8');

  it('re-encodes every photo to JPEG before Skia sees it', () => {
    expect(src).toMatch(/async function prepareForEditing/);
    expect(src).toMatch(/format: m\.SaveFormat\.JPEG/);
    expect(src).toMatch(/editingResize\(/);
  });

  it('falls back to a plain preview when Skia cannot decode, instead of spinning', () => {
    expect(src).toMatch(/useImage\(uri, \(\) => setFailedUri\(uri\)\)/);
    expect(src).toMatch(/failedUri === uri/);
  });
});
