function launchHost() {
  const rawBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL;
  if (!rawBaseUrl) return 'echo.app';

  try {
    const parsed = new URL(rawBaseUrl);
    return parsed.protocol === 'https:' && parsed.hostname ? parsed.hostname : 'echo.app';
  } catch {
    return 'echo.app';
  }
}

module.exports = ({ config }) => {
  const host = launchHost();

  return {
    ...config,
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
