const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

/**
 * Raise every Pods target to the Podfile's own iOS deployment target.
 *
 * The Podfile sets `platform :ios, '15.1'`, but CocoaPods only applies that to
 * the pod targets themselves. The resource-bundle targets it synthesises
 * (`SDWebImage-SDWebImage`, `Sentry-Sentry`, `RNSVG-RNSVGFilters`, …) keep the
 * deployment target declared in each podspec, and some of those are ancient —
 * SDWebImage still says 9.0. Xcode 27 no longer tolerates it:
 *
 *     error: The iOS Simulator deployment target 'IPHONEOS_DEPLOYMENT_TARGET'
 *     is set to 9.0, but the range of supported deployment target versions is
 *     15.0 to 27.0.x. (in target 'SDWebImage-SDWebImage' from project 'Pods')
 *
 * Five targets fail this way and the build stops, so `expo prebuild` followed
 * by a build cannot produce an app at all. expo-build-properties does not cover
 * this — its `ios.deploymentTarget` rewrites the app's own Xcode project and
 * the Podfile platform line, never the generated Pods project.
 *
 * Hence a Podfile patch. It appends to the existing post_install block rather
 * than replacing it, so react_native_post_install still runs first and this
 * only raises the floor afterwards. Targets already at or above the floor are
 * left alone, so no pod is silently dragged forward past its own minimum.
 *
 * Reads the floor from the Podfile's platform line instead of hardcoding it,
 * so bumping `ios.deploymentTarget` in app.json stays a one-line change.
 */

const MARKER = '# withIosPodDeploymentTarget';

const patch = (podfile) => {
  if (podfile.includes(MARKER)) return podfile;

  // [ \t]* rather than \s* — \s matches newlines, so the capture would swallow
  // the blank line above and inject it into every line of the body.
  const anchor = /^([ \t]*)post_install do \|installer\|\n/m;
  const match = podfile.match(anchor);
  if (!match) {
    throw new Error(
      'withIosPodDeploymentTarget could not find a `post_install do |installer|` block in the Podfile. ' +
        'Without it, Pods resource-bundle targets keep pre-iOS-15 deployment targets and Xcode 26+ fails the build.',
    );
  }

  const indent = match[1];
  const body = [
    `${indent}  ${MARKER}: Xcode 26+ rejects deployment targets below 15.0, and`,
    `${indent}  # CocoaPods leaves resource-bundle targets at whatever the podspec said.`,
    `${indent}  floor = Gem::Version.new(podfile_properties['ios.deploymentTarget'] || '15.1')`,
    `${indent}  installer.pods_project.targets.each do |target|`,
    `${indent}    target.build_configurations.each do |bc|`,
    `${indent}      current = bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET']`,
    `${indent}      if current.nil? || Gem::Version.new(current) < floor`,
    `${indent}        bc.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = floor.to_s`,
    `${indent}      end`,
    `${indent}    end`,
    `${indent}  end`,
    '',
  ].join('\n');

  // Insert at the top of the block: react_native_post_install runs after it and
  // does not lower deployment targets, so ordering here is not load-bearing.
  return podfile.replace(anchor, `${match[0]}${body}\n`);
};

module.exports = (config) =>
  withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      fs.writeFileSync(podfile, patch(fs.readFileSync(podfile, 'utf8')));
      return cfg;
    },
  ]);
