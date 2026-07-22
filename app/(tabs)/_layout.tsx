import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, AppState } from 'react-native';
import { Tabs, useRouter, type Href } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { House, MagnifyingGlass, ChatTeardropDots, Bell, User, SquaresFour, Envelope, PencilSimple, Checks, MagicWand, Bell as BellIcon, BellSlash, EyeSlash, Lightning, Storefront } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { useCommandPalette } from '../../lib/commandPalette';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { MiniAppIcon } from '../../components/mini-apps/MiniAppIcon';
import { ReflectiveNavIcon } from '../../components/ui/ReflectiveNavIcon';
import { showToast } from '../../components/ui/Toast';
import { tap } from '../../lib/haptics';
import { clearPushToken, registerForPush } from '../../lib/push';
import { useResponsiveLayout } from '../../lib/responsive';
import { isCheckinPending } from '../../lib/proactiveCheckin';
import { getRecentTools, recordToolOpen } from '../../lib/miniAppRecents';
import { miniAppById } from '../../lib/miniAppCatalog';
import { rememberPrimaryTab } from '../../lib/navigationMemory';
import { useI18n, type TranslationKey } from '../../lib/i18n';

const HIDDEN_ROUTES = new Set(['notifications']);
const DESKTOP_ROUTES = new Set(['home', 'explore', 'marketplace', 'chat', 'you', 'notifications', 'apps']);

const TAB_ICONS: Record<string, React.ComponentType<any>> = {
  home: House,
  explore: MagnifyingGlass,
  marketplace: Storefront,
  chat: ChatTeardropDots,
  you: User,
  notifications: Bell,
  apps: SquaresFour,
};

function BadgeIcon({ children, count }: { children: React.ReactNode; count: number }) {
  const { colors } = useTheme();

  return (
    <View>
      {children}
      <View
        style={[
          {
            position: 'absolute',
            top: -4,
            right: -8,
            backgroundColor: colors.danger,
            borderRadius: 999,
            minWidth: 15,
            height: 15,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 3,
          },
        ]}
      >
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
          {count > 99 ? '99+' : count}
        </Text>
      </View>
    </View>
  );
}

/** Small accent dot — a "something's waiting" hint without a count. */
function DotIcon({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View>
      {children}
      <View style={{
        position: 'absolute',
        top: -2,
        right: -5,
        width: 9,
        height: 9,
        borderRadius: 5,
        backgroundColor: colors.accent,
        borderWidth: 1.5,
        borderColor: colors.bg,
      }} />
    </View>
  );
}

const ROUTE_LABEL_KEYS: Record<string, TranslationKey> = {
  home: 'nav.home',
  explore: 'nav.explore',
  marketplace: 'nav.market',
  chat: 'nav.chat',
  you: 'nav.you',
  notifications: 'nav.alerts',
  apps: 'nav.tools',
};

function routeLabel(routeName: string, t: (key: TranslationKey) => string, title?: string): string {
  if (title) return title;
  const key = ROUTE_LABEL_KEYS[routeName];
  if (key) return t(key);
  return routeName.charAt(0).toUpperCase() + routeName.slice(1);
}

function DesktopSidebar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, font, lineHeights } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const layout = useResponsiveLayout();
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());
  const routes = state.routes.filter(r => DESKTOP_ROUTES.has(r.name));
  const badges: Record<string, number> = { chat: unreadDMs, notifications: unreadNotifications };

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        width: layout.sidebarWidth,
        paddingTop: Math.max(insets.top, layout.isMacDesktop ? 42 : 24),
        paddingBottom: Math.max(insets.bottom, 20),
        paddingHorizontal: 12,
        backgroundColor: colors.isDark ? 'rgba(9,11,15,0.96)' : 'rgba(255,255,255,0.96)',
        borderRightWidth: StyleSheet.hairlineWidth,
        borderRightColor: colors.border,
        zIndex: 30,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, marginBottom: 22 }}>
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Lightning color="#fff" size={18} weight="fill" />
        </View>
        <View>
          <Text style={[font.bodyBold, { color: colors.text, fontSize: 17, lineHeight: lineHeights.body }]}>Echo</Text>
          <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 12, lineHeight: lineHeights.caption, marginTop: 1 }]}>
            {layout.isMacDesktop ? 'Mac' : 'Desktop'}
          </Text>
        </View>
      </View>

      <Pressable
        onPress={() => router.push('/create-post')}
        accessibilityRole="button"
        accessibilityLabel="New Echo"
        style={{
          height: 42,
          borderRadius: 12,
          backgroundColor: colors.accent,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 18,
        }}
      >
        <PencilSimple color="#fff" size={18} weight="bold" />
          <Text style={[font.bodyBold, { color: '#fff', fontSize: 14, lineHeight: lineHeights.small }]}>{t('nav.newEcho')}</Text>
      </Pressable>

      <View style={{ gap: 4 }}>
        {routes.map(route => {
          const isFocused = state.routes[state.index].name === route.name;
          const IconComp = TAB_ICONS[route.name];
          if (!IconComp) return null;

          const title = descriptors[route.key]?.options.title;
          const label = routeLabel(route.name, t, typeof title === 'string' ? title : undefined);
          const badgeCount = badges[route.name] ?? 0;
          const color = isFocused ? colors.accent : colors.textSecondary;

          return (
            <Pressable
              key={route.key}
              onPress={() => {
                const event = navigation.emit({
                  type: 'tabPress',
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name);
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={{ selected: isFocused }}
              style={{
                height: 42,
                borderRadius: 0,
                paddingHorizontal: 12,
                paddingLeft: isFocused ? 10 : 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 11,
                borderLeftWidth: isFocused ? 2 : 0,
                borderLeftColor: colors.accent,
              }}
            >
              <ReflectiveNavIcon active={isFocused} size={30} radius={10}>
                {badgeCount > 0 ? (
                  <BadgeIcon count={badgeCount}>
                    <IconComp color={color} size={18} weight="regular" />
                  </BadgeIcon>
                ) : (
                  <IconComp color={color} size={18} weight="regular" />
                )}
              </ReflectiveNavIcon>
              <Text
                style={[font.bodySemibold, { color, fontSize: 14, lineHeight: lineHeights.small, flex: 1 }]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flex: 1 }} />

      <Pressable
        onPress={() => useCommandPalette.getState().open()}
        accessibilityRole="button"
        accessibilityLabel="Open command palette"
        style={{
          height: 40,
          borderRadius: 11,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        }}
      >
        <MagicWand color={colors.accent} size={17} weight="bold" />
        <Text style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 13, lineHeight: lineHeights.small }]}>{t('nav.commandPalette')}</Text>
      </Pressable>
    </View>
  );
}

function FloatingTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation } = props;
  const { colors, font, lineHeights } = useTheme();
  const { t } = useI18n();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());
  const notificationsEnabled = useAppStore(s => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore(s => s.setNotificationsEnabled);
  const markAllNotificationsRead = useAppStore(s => s.markAllNotificationsRead);
  const proactiveAiEnabled = useAppStore(s => s.proactiveAiEnabled);
  const checkinPending = useAppStore(s => s.proactiveCheckinPending);
  const setCheckinPending = useAppStore(s => s.setProactiveCheckinPending);
  const [longPressKey, setLongPressKey] = useState<string | null>(null);
  const [recentToolIds, setRecentToolIds] = useState<string[]>([]);
  const layout = useResponsiveLayout();

  useEffect(() => {
    const route = state.routes[state.index];
    if (route) rememberPrimaryTab(route.name);
  }, [state.index, state.routes]);

  useEffect(() => {
    const load = () => { void getRecentTools().then(setRecentToolIds).catch(() => setRecentToolIds([])); };
    load();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') load(); });
    return () => sub.remove();
  }, []);

  // Recompute the "Echo has a check-in" dot on mount and when the app returns
  // to the foreground — a new day surfaces a fresh check-in.
  useEffect(() => {
    const evaluate = () => {
      if (!proactiveAiEnabled) { setCheckinPending(false); return; }
      isCheckinPending().then(setCheckinPending).catch(() => {});
    };
    evaluate();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') evaluate(); });
    return () => sub.remove();
  }, [proactiveAiEnabled, setCheckinPending]);

  if (layout.navigationKind === 'desktop-sidebar') {
    return <DesktopSidebar {...props} />;
  }

  const badges: Record<string, number> = { chat: unreadDMs, notifications: unreadNotifications };

  const visibleRoutes = state.routes.filter(r => !HIDDEN_ROUTES.has(r.name));
  const isTabletTabs = layout.navigationKind === 'tablet-tabs';
  const tabHeight = isTabletTabs ? 64 : 56;
  const iconSize = isTabletTabs ? 24 : visibleRoutes.length > 5 ? 21 : 22;
  const labelSize = isTabletTabs ? 11 : visibleRoutes.length > 5 ? 9.5 : 10;
  const recentToolActions = recentToolIds
    .map(id => miniAppById(id))
    .filter((app): app is NonNullable<ReturnType<typeof miniAppById>> => Boolean(app))
    .slice(0, 3);

  const setPushNotifications = async (enabled: boolean) => {
    if (!enabled) {
      setNotificationsEnabled(false);
      await clearPushToken();
      showToast('Push notifications muted', '');
      return;
    }

    const result = await registerForPush();
    setNotificationsEnabled(result.granted);
    showToast(result.granted ? 'Push notifications enabled' : 'Notifications permission denied', result.granted ? 'Done' : '');
  };

  const longPressActions = (routeName: string): ActionItem[] | null => {
    switch (routeName) {
      case 'home':
        return [
          ...(recentToolActions[0] ? [{
            key: 'last-tool',
            label: `Continue ${recentToolActions[0].name}`,
            icon: <MiniAppIcon id={recentToolActions[0].id} color={recentToolActions[0].color} size={30} />,
            onPress: () => {
              void recordToolOpen(recentToolActions[0].id);
              router.push(recentToolActions[0].route);
            },
          }] : []),
          { key: 'tools', label: 'Open Tools', icon: <SquaresFour color={colors.accent} size={18} />, onPress: () => router.push('/(tabs)/apps' as Href) },
          { key: 'compose', label: 'New Echo', icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/create-post') },
        ];
      case 'apps':
        return [
          { key: 'tools', label: 'Open Tools', icon: <SquaresFour color={colors.accent} size={18} />, onPress: () => router.push('/(tabs)/apps' as Href) },
          ...recentToolActions.map(app => ({
            key: app.id,
            label: `Open ${app.name}`,
            icon: <MiniAppIcon id={app.id} color={app.color} size={30} />,
            onPress: () => {
              void recordToolOpen(app.id);
              router.push(app.route);
            },
          })),
        ];
      case 'chat':
        return [
          { key: 'inbox',   label: 'Open Messages',    icon: <Envelope     color={colors.accent} size={18} />, onPress: () => router.push('/messages') },
          { key: 'new',     label: 'New message',      icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/messages') },
          { key: 'palette', label: 'Command palette',  icon: <MagicWand    color={colors.accent} size={18} />, onPress: () => useCommandPalette.getState().open() },
        ];
      case 'notifications':
        return [
          { key: 'readall', label: 'Mark all as read', icon: <Checks color={colors.accent} size={18} />, onPress: () => { markAllNotificationsRead(); showToast('All caught up', 'Done'); } },
          { key: 'mute',    label: notificationsEnabled ? 'Mute push notifications' : 'Unmute push notifications', icon: notificationsEnabled ? <BellSlash color={colors.accent} size={18} /> : <BellIcon color={colors.accent} size={18} />, onPress: () => void setPushNotifications(!notificationsEnabled) },
        ];
      case 'explore':
        return [
          { key: 'compose', label: 'New Echo',           icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/create-post') },
          { key: 'search',  label: 'Search',             icon: <MagnifyingGlass color={colors.accent} size={18} />, onPress: () => router.push('/(tabs)/explore') },
        ];
      case 'marketplace':
        return [
          { key: 'open', label: 'Open Market', icon: <Storefront color={colors.accent} size={18} />, onPress: () => router.push('/(tabs)/marketplace') },
          { key: 'messages', label: 'Seller messages', icon: <Envelope color={colors.accent} size={18} />, onPress: () => router.push('/messages') },
        ];
      case 'you':
        return [
          { key: 'edit',      label: 'Edit profile', icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/edit-profile') },
          { key: 'bookmarks', label: 'Bookmarks',    icon: <EyeSlash     color={colors.accent} size={18} />, onPress: () => router.push('/bookmarks') },
        ];
      default:
        return null;
    }
  };

  const longPressMenuRoute = visibleRoutes.find(r => r.name === longPressKey)?.name;
  const longPressActionList = longPressMenuRoute ? longPressActions(longPressMenuRoute) : null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: tabHeight + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.border,
        overflow: 'hidden',
      }}
      pointerEvents="box-none"
    >
      <BlurView
        intensity={50}
        tint={colors.isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.bg, opacity: 0.72 },
        ]}
        pointerEvents="none"
      />
        <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center', paddingHorizontal: 5 }}>
          {visibleRoutes.map(route => {
            const isFocused = state.routes[state.index].name === route.name;
            const IconComp = TAB_ICONS[route.name];
            if (!IconComp) return null;

            const color = isFocused ? colors.accent : colors.textMuted;
            const badgeCount = badges[route.name] ?? 0;

            return (
              <Pressable
                key={route.key}
                onPress={() => {
                  tap('light');
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!isFocused && !event.defaultPrevented) {
                    navigation.navigate(route.name);
                  }
                }}
                onLongPress={() => {
                  tap('medium');
                  navigation.emit({ type: 'tabLongPress', target: route.key });
                  if (longPressActions(route.name)) {
                    setLongPressKey(route.name);
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={descriptors[route.key]?.options.title ?? routeLabel(route.name, t)}
                accessibilityState={{ selected: isFocused }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <ReflectiveNavIcon active={isFocused} size={isTabletTabs ? 34 : 30} radius={12}>
                  {badgeCount > 0 ? (
                    <BadgeIcon count={badgeCount}>
                      <IconComp color={color} size={iconSize} weight="regular" />
                    </BadgeIcon>
                  ) : route.name === 'chat' && checkinPending && !isFocused ? (
                    <DotIcon>
                      <IconComp color={color} size={iconSize} weight="regular" />
                    </DotIcon>
                  ) : (
                    <IconComp color={color} size={iconSize} weight="regular" />
                  )}
                </ReflectiveNavIcon>
                <Text
                  style={{
                    ...font.bodySemibold,
                    color: isFocused ? colors.accent : colors.textMuted,
                    fontSize: labelSize,
                    lineHeight: lineHeights.caption,
                    marginTop: 1,
                    letterSpacing: 0,
                  }}
                  numberOfLines={1}
                >
                  {descriptors[route.key]?.options.title ?? routeLabel(route.name, t)}
                </Text>
              </Pressable>
            );
          })}
        </View>

      <ActionSheet
        visible={!!longPressActionList}
        onClose={() => setLongPressKey(null)}
        title={longPressMenuRoute ? (descriptors[visibleRoutes.find(r => r.name === longPressMenuRoute)!.key]?.options.title ?? longPressMenuRoute) : undefined}
        actions={(longPressActionList ?? []).map(a => ({
          ...a,
          onPress: () => { a.onPress(); setLongPressKey(null); },
        }))}
      />
    </View>
  );
}

export default function TabLayout() {
  const layout = useResponsiveLayout();
  const { colors } = useTheme();
  const { t } = useI18n();

  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: colors.bg,
          marginLeft: layout.navigationKind === 'desktop-sidebar' ? layout.sidebarWidth : 0,
        },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('nav.home') }} />
      <Tabs.Screen name="explore" options={{ title: t('nav.explore') }} />
      <Tabs.Screen name="marketplace" options={{ title: t('nav.market') }} />
      <Tabs.Screen name="chat" options={{ title: t('nav.chat') }} />
      <Tabs.Screen name="you" options={{ title: t('nav.you') }} />
      <Tabs.Screen name="notifications" options={{ title: t('nav.alerts'), href: null }} />
      <Tabs.Screen name="apps" options={{ title: t('nav.tools') }} />
    </Tabs>
  );
}
