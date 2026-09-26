const { withAppDelegate, withInfoPlist } = require('@expo/config-plugins');

/**
 * Adopt the UIScene lifecycle on iOS, so the app starts on iOS 26+.
 *
 * Built against the iOS 27 SDK, UIKit no longer merely warns about apps that
 * only implement the app-delegate lifecycle — it traps. The app reaches
 * `UIApplicationMain`, the first scene is created, and UIKit hits `brk 0` in
 * `_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption`:
 *
 *     Exception Type: EXC_BREAKPOINT (SIGTRAP)
 *     0  UIKitCore  ___UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption_block_invoke
 *     3  UIKitCore  -[UIApplication workspace:didCreateScene:withTransitionContext:completion:]
 *
 * It dies before a line of JavaScript runs, so it looks exactly like a Metro
 * or bundle failure — the app bounces straight back to the home screen and the
 * only evidence is a crash report. It is neither.
 *
 * Neither Expo SDK 54 nor React Native 0.81 ships a scene delegate (grep the
 * pods: zero hits for UIWindowSceneDelegate), so the app has to supply one.
 *
 * Two parts, and both are required — declaring the manifest on its own does
 * NOT satisfy the check. Verified: with `UIApplicationSceneManifest` present
 * but no `UISceneDelegateClassName`, UIKit traps in exactly the same frame.
 *
 *   1. Info.plist declares a scene configuration naming the delegate class.
 *   2. AppDelegate.swift gains that class.
 *
 * The adoption is deliberately minimal. `application:didFinishLaunchingWith
 * Options:` still runs first and still builds the window and starts React
 * Native through RCTReactNativeFactory; the scene delegate only re-homes that
 * existing window into the UIWindowScene. Nothing in the RN startup path moves,
 * which is what keeps this compatible with whatever Expo does to its own
 * AppDelegate between SDK releases.
 *
 * Remove this plugin once Expo ships scene support upstream — at that point two
 * delegates would be declared and the Expo one should win.
 */

// Marker so re-running prebuild over an already-modified file is a no-op.
const MARKER = 'class SceneDelegate: UIResponder, UIWindowSceneDelegate';

const SCENE_DELEGATE = `

// MARK: - UIScene lifecycle (added by plugins/withIosSceneLifecycle.js)
//
// iOS 26+ traps apps that only implement the app-delegate lifecycle. See the
// plugin for the full crash signature and why the Info.plist entry alone is not
// enough. AppDelegate still creates the window and starts React Native; this
// only adopts that window into the scene.
${MARKER} {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene else { return }

    if let appWindow = (UIApplication.shared.delegate as? AppDelegate)?.window {
      appWindow.windowScene = windowScene
      window = appWindow
      appWindow.makeKeyAndVisible()
    }
  }
}
`;

const withSceneDelegateClass = (config) =>
  withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(
        `withIosSceneLifecycle expected a Swift AppDelegate, got "${cfg.modResults.language}". ` +
          'Without the scene delegate the app traps on launch on iOS 26+.',
      );
    }

    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += SCENE_DELEGATE;
    }

    return cfg;
  });

const withSceneManifest = (config) =>
  withInfoPlist(config, (cfg) => {
    // $(PRODUCT_MODULE_NAME) is substituted by Xcode when it processes the
    // Info.plist, which keeps this correct if the target is ever renamed.
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };

    return cfg;
  });

module.exports = (config) => withSceneManifest(withSceneDelegateClass(config));
