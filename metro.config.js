const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

const config = getDefaultConfig(__dirname);

// phosphor-react-native v3 ships TypeScript source with circular `import { type }` statements.
// Metro's Babel transform doesn't fully erase inline type-only imports, causing circular runtime
// requires that make icon exports resolve as `undefined`. Force Metro to use the pre-compiled
// CommonJS output which has no circular deps.
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
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = withNativeWind(config, { input: "./global.css" });
