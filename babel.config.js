module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    plugins: [
      ["@babel/plugin-transform-typescript", { "allowDeclareFields": true, "allowNamespaces": true }],
      ["@babel/plugin-proposal-decorators", { "legacy": true }]
    ]
  };
};
