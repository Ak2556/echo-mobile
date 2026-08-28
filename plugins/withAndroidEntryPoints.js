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

const SUB_PACKAGE = 'entry';

/**
 * Two more doors, both needing a little native code.
 *
 * The Quick Settings tile is a TileService — there is no manifest-only way to
 * put something in the pull-down shade.
 *
 * ACTION_PROCESS_TEXT is what puts "Echo" in the popup when text is selected in
 * any app. The selection arrives as an intent extra, which expo-linking cannot
 * see, so a tiny activity reads it and re-launches Echo as an ordinary deep
 * link carrying the text. That keeps the whole thing on the existing share
 * chooser instead of needing a native module bridged into JS.
 */
const kotlinSources = pkg => ({
  'EchoVoiceTileService.kt': `package ${pkg}.${SUB_PACKAGE}

import android.content.Intent
import android.net.Uri
import android.service.quicksettings.TileService

/** "Speak to Echo" in the pull-down shade. */
class EchoVoiceTileService : TileService() {
  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("echo:///voice"))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

    // Collapses the shade and unlocks first if it needs to; the deprecated
    // startActivityAndCollapse(Intent) is a hard error on Android 14+.
    if (android.os.Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(
        android.app.PendingIntent.getActivity(
          this, 0, intent,
          android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )
      )
    } else {
      @Suppress("DEPRECATION")
      startActivityAndCollapse(intent)
    }
  }
}
`,

  'EchoProcessTextActivity.kt': `package ${pkg}.${SUB_PACKAGE}

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle

/**
 * Receives text selected in another app and hands it to Echo as a deep link.
 *
 * Invisible by design: it exists only to turn an intent extra into a URL, so
 * the selection lands on the same chooser a share does.
 */
class EchoProcessTextActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    try {
      val selected = intent?.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString().orEmpty()
      val uri = Uri.parse("echo:///share-intent")
        .buildUpon()
        .appendQueryParameter("text", selected)
        .build()
      startActivity(
        Intent(Intent.ACTION_VIEW, uri)
          .setPackage(packageName)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    } catch (e: Exception) {
      // Nothing useful to show; just get out of the way.
    }
    finish()
  }
}
`,
});

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

      const kotlinDir = path.join(
        cfg.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.'),
        SUB_PACKAGE,
      );
      fs.mkdirSync(kotlinDir, { recursive: true });
      for (const [name, body] of Object.entries(kotlinSources(packageName))) {
        fs.writeFileSync(path.join(kotlinDir, name), body, 'utf8');
      }

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

const withTileAndProcessText = (config, { packageName }) =>
  withAndroidManifest(config, cfg => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    const sub = packageName + '.' + SUB_PACKAGE;

    app.service = (app.service ?? []).filter(
      x => x.$['android:name'] !== sub + '.EchoVoiceTileService',
    );
    app.service.push({
      $: {
        'android:name': sub + '.EchoVoiceTileService',
        'android:exported': 'true',
        'android:label': '@string/shortcut_speak_long',
        'android:icon': '@mipmap/ic_launcher',
        'android:permission': 'android.permission.BIND_QUICK_SETTINGS_TILE',
      },
      'intent-filter': [
        { action: [{ $: { 'android:name': 'android.service.quicksettings.action.QS_TILE' } }] },
      ],
    });

    app.activity = (app.activity ?? []).filter(
      a => a.$['android:name'] !== sub + '.EchoProcessTextActivity',
    );
    app.activity.push({
      $: {
        'android:name': sub + '.EchoProcessTextActivity',
        'android:exported': 'true',
        'android:label': '@string/app_name',
        'android:theme': '@android:style/Theme.NoDisplay',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': 'android.intent.action.PROCESS_TEXT' } }],
          category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }],
          data: [{ $: { 'android:mimeType': 'text/plain' } }],
        },
      ],
    });

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
  config = withTileAndProcessText(config, { packageName });
  return config;
};
