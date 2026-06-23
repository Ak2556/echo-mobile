import { useMemo } from 'react';
import { Platform, useWindowDimensions, ViewStyle } from 'react-native';

const PHONE_GUTTER = 16;
const TABLET_GUTTER = 28;
const DESKTOP_GUTTER = 28;
const FEED_MAX_WIDTH = 680;
const WIDE_MAX_WIDTH = 920;
const DESKTOP_FEED_MAX_WIDTH = 760;
const DESKTOP_WIDE_MAX_WIDTH = 1180;
const DESKTOP_SIDEBAR_WIDTH = 232;

type NavigationKind = 'phone-tabs' | 'tablet-tabs' | 'desktop-sidebar';

function getWebPlatform() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return { userAgent: '', platform: '' };
  }
  return {
    userAgent: navigator.userAgent ?? '',
    platform: navigator.platform ?? '',
  };
}

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortest = Math.min(width, height);
    const webPlatform = getWebPlatform();
    const isDesktop = Platform.OS === 'web' && width >= 1024;
    const isMacDesktop = isDesktop && (
      /Electron|Macintosh|Mac OS X/i.test(webPlatform.userAgent) ||
      /Mac/i.test(webPlatform.platform)
    );
    const isTablet = !isDesktop && shortest >= 744;
    const isPhone = !isDesktop && !isTablet;
    const isWide = isDesktop || isTablet || width >= 900;
    const gutter = isDesktop ? DESKTOP_GUTTER : isWide ? TABLET_GUTTER : PHONE_GUTTER;
    const contentMaxWidth = isDesktop ? DESKTOP_FEED_MAX_WIDTH : isWide ? FEED_MAX_WIDTH : width;
    const wideMaxWidth = isDesktop ? DESKTOP_WIDE_MAX_WIDTH : isWide ? WIDE_MAX_WIDTH : width;
    const contentWidth = Math.min(width, contentMaxWidth);
    const wideContentWidth = Math.min(width, wideMaxWidth);
    const formMaxWidth = isDesktop ? 460 : isTablet ? 560 : width;
    const formWidth = Math.min(width, formMaxWidth);
    const sidebarWidth = isDesktop ? DESKTOP_SIDEBAR_WIDTH : 0;
    const cardGap = isDesktop ? 18 : isTablet ? 16 : 12;
    const chromeRadius = isDesktop ? 16 : isTablet ? 18 : 20;
    const topChromePadding = isDesktop ? 20 : 0;
    const bottomChromePadding = isDesktop ? 32 : 110;
    const navigationKind: NavigationKind = isDesktop
      ? 'desktop-sidebar'
      : isTablet
        ? 'tablet-tabs'
        : 'phone-tabs';

    const contentStyle: ViewStyle = {
      width: '100%',
      maxWidth: contentMaxWidth,
      alignSelf: 'center',
    };

    const wideContentStyle: ViewStyle = {
      width: '100%',
      maxWidth: wideMaxWidth,
      alignSelf: 'center',
    };

    const formStyle: ViewStyle = {
      width: '100%',
      maxWidth: formMaxWidth,
      alignSelf: 'center',
    };

    return {
      width,
      height,
      gutter,
      isDesktop,
      isMacDesktop,
      isTablet,
      isPhone,
      isWide,
      sidebarWidth,
      navigationKind,
      contentWidth,
      wideContentWidth,
      formWidth,
      contentMaxWidth,
      wideMaxWidth,
      formMaxWidth,
      cardGap,
      chromeRadius,
      topChromePadding,
      bottomChromePadding,
      contentStyle,
      wideContentStyle,
      formStyle,
    };
  }, [height, width]);
}
