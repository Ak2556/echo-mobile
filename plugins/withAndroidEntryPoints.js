const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withStringsXml,
} = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Ways into Echo that do not start with the app already open.
 *
 * Two things, both manifest-level, neither needing a new native module:
 *
 *   1. Launcher shortcuts — long-press the icon for "Speak to Echo", "New
 *      echo", "Messages". Each is a VIEW intent on an echo:// URL, so
 *      expo-router handles them exactly like any other deep link and there is
 *      no bridge to write.
 *
 *   2. The assistant role — an ACTION_ASSIST filter, which is what puts Echo
 *      in Settings → Default apps → Digital assistant app. Once a user picks
 *      it, the system assist gesture summons Echo instead of Google. This is
 *      the difference between an app you open and one you reach for.
 *
 * android/ is gitignored prebuild output, so this has to be a plugin: editing
 * the manifest directly would be erased by the next prebuild.
 */

const SHORTCUTS = [
  { id: 'speak',    url: 'echo:///voice',           short: 'Speak',    long: 'Speak to Echo' },
  { id: 'compose',  url: 'echo:///create-post',     short: 'New echo', long: 'Write a new echo' },
  { id: 'messages', url: 'echo:///messages',        short: 'Messages', long: 'Open your messages' },
];

/** Labels live in strings.xml so they can be localised like anything else. */
const withShortcutStrings = config =>
  withStringsXml(config, cfg => {
    for (const s of SHORTCUTS) {
      cfg.modResults = AndroidConfig.Strings.setStringItem(
        [
          { $: { name: `shortcut_${s.id}_short`, translatable: 'true' }, _: s.short },
          { $: { name: `shortcut_${s.id}_long`, translatable: 'true' }, _: s.long },
        ],
        cfg.modResults,
      );
    }
    return cfg;
  });

const withShortcutsXml = (config, { packageName }) =>
  withDangerousMod(config, [
    'android',
    cfg => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });

      const shortcuts = SHORTCUTS.map(s => `
  <shortcut
      android:shortcutId="${s.id}"
      android:enabled="true"
      android:icon="@mipmap/ic_launcher"
      android:shortcutShortLabel="@string/shortcut_${s.id}_short"
      android:shortcutLongLabel="@string/shortcut_${s.id}_long">
    <intent
        android:action="android.intent.action.VIEW"
        android:targetPackage="${packageName}"
        android:targetClass="${packageName}.MainActivity"
        android:data="${s.url}" />
  </shortcut>`).join('\n');

      fs.writeFileSync(
        path.join(dir, 'shortcuts.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">${shortcuts}
</shortcuts>
`,
        'utf8',
      );
      return cfg;
    },
  ]);

const withAssistAndShortcutMeta = config =>
  withAndroidManifest(config, cfg => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);

    // Point the launcher at the shortcut list.
    activity['meta-data'] = (activity['meta-data'] ?? []).filter(
      m => m.$['android:name'] !== 'android.app.shortcuts',
    );
    activity['meta-data'].push({
      $: { 'android:name': 'android.app.shortcuts', 'android:resource': '@xml/shortcuts' },
    });

    // Offer Echo as the device's assistant. DEFAULT is required for the
    // system to consider the activity a valid target for the assist gesture.
    const hasAssist = (activity['intent-filter'] ?? []).some(f =>
      (f.action ?? []).some(a => a.$['android:name'] === 'android.intent.action.ASSIST'),
    );
    if (!hasAssist) {
      activity['intent-filter'] = activity['intent-filter'] ?? [];
      activity['intent-filter'].push({
        action: [{ $: { 'android:name': 'android.intent.action.ASSIST' } }],
        category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
      });
    }

    return cfg;
  });

module.exports = function withAndroidEntryPoints(config) {
  const packageName = config.android?.package;
  if (!packageName) {
    throw new Error('withAndroidEntryPoints: expo.android.package must be set');
  }
  config = withShortcutStrings(config);
  config = withShortcutsXml(config, { packageName });
  config = withAssistAndShortcutMeta(config);
  return config;
};
