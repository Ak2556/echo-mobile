const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Sign release builds with a real upload keystore instead of Expo's debug one.
 *
 * React Native's template ships `release { signingConfig signingConfigs.debug }`
 * with a comment telling you to fix it, and prebuild regenerates that file every
 * time, so the comment is the only thing anyone ever sees. The APK published on
 * downloadecho.com was signed with `android/app/debug.keystore` — password
 * `android`, DN `CN=Android Debug`, SHA-256 fac61745…33b9c — which Expo vendors
 * into every prebuild on earth. Three consequences, worst first:
 *
 *   1. Anyone can forge an Echo update. Android accepts an update signed with
 *      the same key, so an APK signed with the shared debug key installs over
 *      Echo and inherits its data and its permissions.
 *   2. Play refuses debug-signed uploads outright.
 *   3. App Links cannot be verified: publishing that fingerprint in
 *      assetlinks.json would declare every debug-signed app on the planet a
 *      verified handler for downloadecho.com.
 *
 * This appends to the bottom of app/build.gradle rather than rewriting the
 * `buildTypes` block. Gradle evaluates the script top to bottom, so assigning
 * `buildTypes.release.signingConfig` afterwards wins, and nothing has to
 * pattern-match template source that changes with every Expo release.
 *
 * It is inert without the four properties, so `expo run:android` still works
 * for anyone who does not hold the keystore — local debug builds are supposed
 * to be debug-signed. That means absence cannot be caught here, and the real
 * guard is downstream: .github/workflows/android-beta.yml refuses to publish an
 * APK whose signer is the debug certificate. Config decides what to use; the
 * artifact check decides what may ship.
 *
 * Gradle reads ORG_GRADLE_PROJECT_<name> from the environment, so CI passes the
 * passwords without writing them into gradle.properties, where a stray commit
 * or an uploaded build log would expose them.
 */

const MARKER = '// echo:upload-signing';

const SNIPPET = `
${MARKER} — injected by plugins/withAndroidReleaseSigning.js. Do not edit here;
// android/ is prebuild output and this file is regenerated.
//
// Absent properties leave release signing exactly as the template left it, so a
// developer without the keystore can still build. CI must not rely on that:
// the workflow verifies the signer of the finished APK.
def echoUploadStore = findProperty('ECHO_UPLOAD_STORE_FILE')
if (echoUploadStore) {
    def echoUploadStoreFile = rootProject.file(echoUploadStore)
    if (!echoUploadStoreFile.exists()) {
        // Fail loudly. A missing keystore here would otherwise fall through to
        // the debug config and produce a forgeable APK that looks successful.
        throw new GradleException("ECHO_UPLOAD_STORE_FILE is set to \\"\${echoUploadStore}\\" but no file exists there (resolved to \${echoUploadStoreFile.absolutePath}).")
    }
    android.signingConfigs.create('upload') {
        storeFile echoUploadStoreFile
        storePassword findProperty('ECHO_UPLOAD_STORE_PASSWORD')
        keyAlias findProperty('ECHO_UPLOAD_KEY_ALIAS')
        keyPassword findProperty('ECHO_UPLOAD_KEY_PASSWORD')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.upload
    logger.lifecycle("Echo: release builds will be signed with the upload keystore.")
}
`;

module.exports = function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, cfg => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        `withAndroidReleaseSigning: expected a Groovy build.gradle, got ${cfg.modResults.language}`,
      );
    }
    // Idempotent: prebuild may run more than once against the same file.
    if (cfg.modResults.contents.includes(MARKER)) return cfg;
    cfg.modResults.contents += SNIPPET;
    return cfg;
  });
};
