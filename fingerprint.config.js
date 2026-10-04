// What the OTA runtime fingerprint is allowed to depend on.
//
// runtimeVersion is `{ policy: 'fingerprint' }`, so an update only reaches an install
// whose embedded fingerprint equals the one `eas update` computes from main. By
// default that hash also covers `.gitignore` and the `package.json` scripts, neither
// of which can change a native binary. On 2026-10-03/04 two housekeeping PRs edited
// .gitignore and every OTA published from main after them targeted a runtime that no
// installed APK had: the fix would have been published and reached nobody.
//
// Skipped here so an edit to either cannot strand installs. Anything that does change
// native code (plugins, app.json native config, native dependencies, assets, eas.json,
// google-services.json) still changes the fingerprint, as it should.
module.exports = {
  sourceSkips: ['GitIgnore', 'PackageJsonScriptsAll'],
};
