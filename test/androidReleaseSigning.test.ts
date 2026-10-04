import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * The APK published on downloadecho.com was signed with Expo's vendored
 * android/app/debug.keystore — password `android`, DN `CN=Android Debug`,
 * SHA-256 fac61745…33b9c. Every Expo developer holds that private key, and
 * Android accepts an update signed with the same key as the installed app, so
 * anyone could ship a build that replaces Echo and inherits its data and
 * permissions. It also makes Play reject the upload and makes App Links
 * unverifiable.
 *
 * The cause is that React Native's template writes
 * `release { signingConfig signingConfigs.debug }` and `expo prebuild`
 * regenerates that file on every CI run, so a one-time edit cannot hold —
 * android/ is gitignored build output.
 *
 * Two layers, and this file pins both:
 *   - config: plugins/withAndroidReleaseSigning.js repoints release signing
 *     when an upload keystore is supplied.
 *   - artifact: scripts/verify-apk-signer.sh refuses a debug-signed APK, and
 *     the workflow runs it before anything is distributed.
 *
 * The artifact layer is the one that matters. Configuration regresses quietly;
 * a signature check on the finished file cannot be fooled by a template change.
 */

const ROOT = resolve(__dirname, '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SHARED_DEBUG_SHA = 'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c';

describe('release builds are not signed with the shared debug key', () => {
  it('the signing plugin is registered in app.json', () => {
    const app = JSON.parse(read('app.json'));
    const plugins: unknown[] = (app.expo ?? app).plugins;
    const names = plugins.map(p => (Array.isArray(p) ? p[0] : p));
    expect(names).toContain('./plugins/withAndroidReleaseSigning');
  });

  it('the plugin repoints release signing and refuses a missing keystore', () => {
    const src = read('plugins/withAndroidReleaseSigning.js');
    // Must assign the release buildType, not merely declare a config nobody uses.
    expect(src).toMatch(/android\.buildTypes\.release\.signingConfig\s*=/);
    expect(src).toMatch(/ECHO_UPLOAD_STORE_FILE/);
    // A path that does not exist must stop the build. Falling through to the
    // debug config here is precisely how a forgeable APK looks like a success.
    expect(src).toMatch(/throw new GradleException/);
    // Inert without the property, so `expo run:android` still works for a
    // developer who does not hold the keystore.
    expect(src).toMatch(/if \(echoUploadStore\)/);
  });

  it('the verify script rejects the debug fingerprint by value', () => {
    const src = read('scripts/verify-apk-signer.sh');
    expect(src).toContain(SHARED_DEBUG_SHA);
    expect(src).toMatch(/CN=Android Debug/);
    // Must fail on an unreadable signer rather than treating "no certificate
    // found" as "not debug-signed".
    expect(src).toMatch(/could not read any signer certificate/i);
    // apksigner's label differs across build-tools versions, so the script
    // scans for hex digests instead of parsing one specific line.
    expect(src).toMatch(/\[0-9a-f\]\{64\}/);
  });

  it('the workflow verifies the signer before it distributes or uploads', () => {
    const wf = read('.github/workflows/android-beta.yml');
    const at = (needle: string) => wf.indexOf(needle);

    const verify = at('scripts/verify-apk-signer.sh');
    const firebase = at('fastlane distribute');
    const artifact = at('upload-artifact');

    expect(verify, 'the workflow must run the verify script').toBeGreaterThan(-1);
    expect(firebase).toBeGreaterThan(-1);
    expect(artifact).toBeGreaterThan(-1);
    expect(verify, 'verify must precede Firebase distribution').toBeLessThan(firebase);
    expect(verify, 'verify must precede the artifact upload').toBeLessThan(artifact);
  });

  it('the workflow fails closed when the keystore secret is absent', () => {
    const wf = read('.github/workflows/android-beta.yml');
    expect(wf).toMatch(/ANDROID_UPLOAD_KEYSTORE_BASE64/);
    // An absent secret must stop the run. Building anyway would produce a
    // debug-signed APK, which is the bug this whole file exists to prevent.
    expect(wf).toMatch(/if \[ -z "\$ANDROID_UPLOAD_KEYSTORE_BASE64" \]/);
    expect(wf).toMatch(/Refusing to build a release APK/);
    // The passwords must reach Gradle as project properties, not be written
    // into gradle.properties where a log or a stray commit would leak them.
    expect(wf).toMatch(/ORG_GRADLE_PROJECT_ECHO_UPLOAD_STORE_PASSWORD/);
    expect(wf).not.toMatch(/ECHO_UPLOAD_STORE_PASSWORD.*>>.*gradle\.properties/);
  });

  it('the distribute lane uploads without rebuilding', () => {
    const fastfile = read('fastlane_android/Fastfile');
    const lane = fastfile.slice(fastfile.indexOf('lane :distribute'));
    const body = lane.slice(0, lane.indexOf('\n  end'));
    // Re-running assemble here would re-sign after the check had passed, with
    // whatever signing properties this step happened to have.
    expect(body).not.toMatch(/gradle\(/);
    expect(body).toMatch(/firebase_app_distribution/);
  });
});
