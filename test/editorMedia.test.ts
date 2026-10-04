import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Editor video trim and gallery save', () => {
  it('the local native module is declared Android-only and registered', () => {
    const cfg = JSON.parse(read('modules/echo-media/expo-module.config.json'));
    expect(cfg.platforms).toEqual(['android']);
    expect(cfg.android.modules).toEqual(['expo.modules.echomedia.EchoMediaModule']);
    expect(existsSync(join(root, 'modules/echo-media/android/src/main/java/expo/modules/echomedia/EchoMediaModule.kt'))).toBe(true);
    // The Kotlin class and the JS name must agree or requireOptionalNativeModule returns null forever.
    expect(read('modules/echo-media/android/src/main/java/expo/modules/echomedia/EchoMediaModule.kt')).toMatch(/Name\("EchoMedia"\)/);
    expect(read('lib/media/echoMedia.ts')).toMatch(/requireOptionalNativeModule<EchoMediaNative>\('EchoMedia'\)/);
  });

  it('never needs the broad photo/video read permissions', () => {
    const app = read('app.json');
    expect(app).not.toMatch(/expo-media-library/);
    expect(app).toMatch(/blockedPermissions[\s\S]*READ_EXTERNAL_STORAGE/);
  });

  it('the Editor falls back to the system picker where the module is absent', () => {
    const editor = read('app/mini-apps/editor.tsx');
    expect(editor).toMatch(/allowsEditing: !ownTrimmer/);
    expect(editor).toMatch(/canSaveToGallery\(\)/);
    expect(editor).toMatch(/<VideoTrimmer/);
  });
});
