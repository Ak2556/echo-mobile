// Replaces the widget views that expo-live-activity copies into ios/LiveActivity with Echo's
// own SwiftUI (plugins/live-activity-ui). The library keeps doing the rest: the extension
// target, the attributes, and the start/update/stop module the app calls.
//
// Runs as a finalized mod so it lands after the library has copied its files; the Xcode
// project already references these two file names, so overwriting their contents is enough.
const { withFinalizedMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const FILES = ['LiveActivityView.swift', 'LiveActivityWidget.swift'];

module.exports = function withEchoLiveActivityUI(config) {
  return withFinalizedMod(config, [
    'ios',
    async cfg => {
      const source = path.join(cfg.modRequest.projectRoot, 'plugins', 'live-activity-ui');
      const target = path.join(cfg.modRequest.platformProjectRoot, 'LiveActivity');
      for (const file of FILES) {
        fs.copyFileSync(path.join(source, file), path.join(target, file));
      }
      return cfg;
    },
  ]);
};
