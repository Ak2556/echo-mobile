import React, { useEffect } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { House, MagnifyingGlass, ChatTeardropDots, Bell, User, SquaresFour, FilmStrip } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { useCommandPalette } from '../../lib/commandPalette';
import { GlassPanel } from '../../components/ui/GlassPanel';

const HIDDEN_ROUTES = new Set(['history']);

const TAB_ICONS: Record<string, React.ComponentType<any>> = {
  discover: House,
  search: MagnifyingGlass,
  echoes: FilmStrip,
  chat: ChatTeardropDots,
  notifications: Bell,
  apps: SquaresFour,
  profile: User,
};

function BadgeIcon({ children, count }: { children: React.ReactNode; count: number }) {
  const { colors, reduceAnimations } = useTheme();
  const scale = useSharedValue(0);

  useEffect(() => {
    if (count > 0) {
      scale.value = reduceAnimations
        ? 1
        : withSequence(
            withSpring(1.3, { damping: 6, stiffness: 300 }),
            withSpring(1, { damping: 10, stiffness: 300 })
          );
    } else {
      scale.value = reduceAnimations ? 0 : withSpring(0, { damping: 12, stiffness: 300 });
    }
  }, [count]);

  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View>
      {children}
      <Animated.View
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
          badgeStyle,
        ]}
      >
        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '700' }}>
          {count > 99 ? '99+' : count}
        </Text>
      </Animated.View>
    </View>
  );
}

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const { colors, reduceAnimations } = useTheme();
  const insets = useSafeAreaInsets();
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());

  const badges: Record<string, number> = { chat: unreadDMs, notifications: unreadNotifications };

  const visibleRoutes = state.routes.filter(r => !HIDDEN_ROUTES.has(r.name));
  const bottom = insets.bottom > 0 ? insets.bottom + 8 : 16;

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
                  // Long-press the chat (Echo) tab anywhere = open AI command palette.
                  if (route.name === 'chat') {
                    useCommandPalette.getState().open();
                    return;
                  }
                  navigation.emit({ type: 'tabLongPress', target: route.key });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}
              >
                {/* Active glow circle */}
                {isFocused && (
                  <View
                    style={{
                      position: 'absolute',
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: colors.accentMuted,
                    }}
                  />
                )}
                {badgeCount > 0 ? (
                  <BadgeIcon count={badgeCount}>
                    <IconComp color={color} size={22} weight={isFocused ? 'fill' : 'regular'} />
                  </BadgeIcon>
                ) : (
                  <IconComp color={color} size={22} weight={isFocused ? 'fill' : 'regular'} />
                )}
              </Pressable>
            );
          })}
        </View>
      </GlassPanel>
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
      <Tabs.Screen name="echoes" options={{ title: 'Echoes' }} />
      <Tabs.Screen name="chat" options={{ title: 'Echo' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Activity' }} />
      <Tabs.Screen name="apps" options={{ title: 'Apps' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
      <Tabs.Screen name="history" options={{ href: null }} />
    </Tabs>
  );
}
