const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Use the compiled Phosphor entrypoint to avoid runtime cycles in the package's TypeScript source.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "phosphor-react-native") {
    return {
      filePath: path.resolve(
        __dirname,
        "node_modules/phosphor-react-native/lib/commonjs/index.js"
      ),
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
      filePath: path.resolve(__dirname, "lib/expoVideoShim.js"),
      type: "sourceFile",
    };
  }
  // Supabase Realtime may import ws; native builds need a no-op module for Node-only transports.
  if (moduleName === "ws" && (platform === "ios" || platform === "android")) {
    return {
      filePath: path.resolve(__dirname, "lib/emptyShim.js"),
      type: "sourceFile",
    };
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
