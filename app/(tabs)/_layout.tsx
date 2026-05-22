import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { House, MagnifyingGlass, ChatTeardropDots, Bell, User, SquaresFour, FilmStrip, GitBranch, Envelope, PencilSimple, Checks, MagicWand, Bell as BellIcon, BellSlash, EyeSlash } from 'phosphor-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { useCommandPalette } from '../../lib/commandPalette';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { ActionSheet, ActionItem } from '../../components/common/ActionSheet';
import { showToast } from '../../components/ui/Toast';
import { tap } from '../../lib/haptics';

// `apps` is hidden from the floating tab bar — mini-apps are now surfaced
// from the Profile screen instead, freeing a slot for `evolutions` which
// is the signature AI-native discovery surface. `history` and `echoes`
// remain hidden as before (echoes is reachable from the profile flow).
const HIDDEN_ROUTES = new Set(['history', 'echoes', 'apps']);

const TAB_ICONS: Record<string, React.ComponentType<any>> = {
  discover: House,
  search: MagnifyingGlass,
  evolutions: GitBranch,
  echoes: FilmStrip,
  chat: ChatTeardropDots,
  notifications: Bell,
  apps: SquaresFour,
  profile: User,
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

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());
  const notificationsEnabled = useAppStore(s => s.notificationsEnabled);
  const setNotificationsEnabled = useAppStore(s => s.setNotificationsEnabled);
  const markAllNotificationsRead = useAppStore(s => s.markAllNotificationsRead);
  const [longPressKey, setLongPressKey] = useState<string | null>(null);

  const badges: Record<string, number> = { chat: unreadDMs, notifications: unreadNotifications };

  const visibleRoutes = state.routes.filter(r => !HIDDEN_ROUTES.has(r.name));
  const bottom = insets.bottom > 0 ? insets.bottom + 8 : 16;

  // Per-tab long-press menus. Returns null when there's nothing useful to show
  // (we still emit the navigation `tabLongPress` event in that case, so other
  // listeners can react).
  const longPressActions = (routeName: string): ActionItem[] | null => {
    switch (routeName) {
      case 'chat':
        return [
          { key: 'inbox',   label: 'Open Messages',    icon: <Envelope     color={colors.accent} size={18} />, onPress: () => router.push('/messages') },
          { key: 'new',     label: 'New conversation', icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/messages') },
          { key: 'palette', label: 'Command palette',  icon: <MagicWand    color={colors.accent} size={18} />, onPress: () => useCommandPalette.getState().open() },
        ];
      case 'notifications':
        return [
          { key: 'readall', label: 'Mark all as read', icon: <Checks color={colors.accent} size={18} />, onPress: () => { markAllNotificationsRead(); showToast('All caught up', '✓'); } },
          { key: 'mute',    label: notificationsEnabled ? 'Mute push notifications' : 'Unmute push notifications', icon: notificationsEnabled ? <BellSlash color={colors.accent} size={18} /> : <BellIcon color={colors.accent} size={18} />, onPress: () => setNotificationsEnabled(!notificationsEnabled) },
        ];
      case 'discover':
        return [
          { key: 'compose', label: 'New Echo',           icon: <PencilSimple color={colors.accent} size={18} />, onPress: () => router.push('/create-post') },
          { key: 'search',  label: 'Search',             icon: <MagnifyingGlass color={colors.accent} size={18} />, onPress: () => router.push('/(tabs)/search') },
        ];
      case 'profile':
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
        bottom,
        left: 16,
        right: 16,
        height: 64,
      }}
      pointerEvents="box-none"
    >
      <GlassPanel borderRadius={32} intensity={60} style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}>
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
                accessibilityLabel={descriptors[route.key]?.options.title ?? route.name}
                accessibilityState={{ selected: isFocused }}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 2,
                  backgroundColor: isFocused ? colors.accentMuted : 'transparent',
                  borderRadius: 18,
                  marginHorizontal: 4,
                  marginVertical: 14,
                }}
              >
                {badgeCount > 0 ? (
                  <BadgeIcon count={badgeCount}>
                    <IconComp color={color} size={22} weight={isFocused ? 'fill' : 'regular'} />
                  </BadgeIcon>
                ) : (
                  <IconComp color={color} size={22} weight={isFocused ? 'fill' : 'regular'} />
                )}
                {isFocused ? (
                  <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800', marginTop: 1 }} numberOfLines={1}>
                    {descriptors[route.key]?.options.title ?? route.name}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </GlassPanel>

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
  return (
    <Tabs
      tabBar={props => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Tabs.Screen name="discover" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Explore' }} />
      <Tabs.Screen name="evolutions" options={{ title: 'Evolve' }} />
      <Tabs.Screen name="chat" options={{ title: 'Chat' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Activity' }} />
      <Tabs.Screen name="echoes" options={{ href: null }} />
      <Tabs.Screen name="apps" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
