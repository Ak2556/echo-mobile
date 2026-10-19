// getSentryExpoConfig wraps expo/metro-config's getDefaultConfig and adds
// Sentry's serializer, which injects debug IDs into the bundle so uploaded
// sourcemaps reliably match production crashes (@sentry/react-native 7.x).
const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);

// Phosphor: the package barrel bundles all 1,512 icons (22% of the Hermes bytecode). Resolve it to a
// generated file that requires only the icons the app imports, from the compiled CommonJS output
// (the TypeScript source has runtime cycles). Regenerate with `node scripts/gen-icon-shim.mjs`.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "phosphor-react-native") {
    return {
      filePath: path.resolve(__dirname, "lib/core/phosphorShim.js"),
      type: "sourceFile",
    };
  }
  if (moduleName === "react-native/package.json") {
    return {
      filePath: path.resolve(__dirname, "node_modules/react-native/package.json"),
      type: "sourceFile",
    };
  }
  // Keep expo-video imports stable in runtimes where the native module is unavailable.
  if (moduleName === "expo-video") {
    return {
      filePath: path.resolve(__dirname, "lib/core/expoVideoShim.js"),
      type: "sourceFile",
    };
  }
  // Supabase Realtime may import ws; native builds need a no-op module for Node-only transports.
  if (moduleName === "ws" && (platform === "ios" || platform === "android")) {
    return {
      filePath: path.resolve(__dirname, "lib/core/emptyShim.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
