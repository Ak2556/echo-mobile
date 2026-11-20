function launchHost() {
  const rawBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if (!rawBaseUrl) return 'downloadecho.com';

  try {
    const parsed = new URL(rawBaseUrl);
    return parsed.protocol === 'https:' && parsed.hostname ? parsed.hostname : 'downloadecho.com';
  } catch {
    return 'downloadecho.com';
  }
}

// The hardened Android build (eas.json "preview" sets ECHO_HARDENED_BUILD=1): R8 shrinks, optimises
// and renames the Java/Kotlin code, and unused resources are removed. Hermes is the engine for every
// build already (Expo SDK 54 default; nothing in the config switches it off), so the JavaScript ships
// as bytecode. Gated on the flag because the plugin options are part of the update fingerprint:
// builds without it keep the runtime they have today.
function withHardenedAndroid(plugins) {
  if (process.env.ECHO_HARDENED_BUILD !== '1') return plugins;
  const options = { android: { enableMinifyInReleaseBuilds: true, enableShrinkResourcesInReleaseBuilds: true } };
  return (plugins ?? []).map(p => {
    const name = Array.isArray(p) ? p[0] : p;
    return name === 'expo-build-properties' ? [name, { ...(Array.isArray(p) ? p[1] : {}), ...options }] : p;
  });
}

module.exports = ({ config }) => {
  const host = launchHost();

  return {
    ...config,
    plugins: withHardenedAndroid(config.plugins),
    ios: {
      ...config.ios,
      associatedDomains: [`applinks:${host}`],
    },
    android: {
      ...config.android,
      intentFilters: [
        {
          action: 'VIEW',
          autoVerify: true,
          data: ['/e', '/u', '/c'].map(pathPrefix => ({
            scheme: 'https',
            host,
            pathPrefix,
          })),
          category: ['BROWSABLE', 'DEFAULT'],
        },
      ],
    },
  };
};
