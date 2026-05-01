import React, { useEffect, useRef } from 'react';
import { View, Text, Dimensions } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { House, MagnifyingGlass, ChatTeardropDots, Bell, User, SquaresFour, FilmStrip } from 'phosphor-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, interpolate } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';
import { useCommandPalette } from '../../lib/commandPalette';
import { GlassPanel } from '../../components/ui/GlassPanel';
import { AnimatedPressable } from '../../components/ui/AnimatedPressable';
import { MOTION } from '../../lib/motion';

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
            withSpring(1.15, MOTION.overshoot),
            withSpring(1, MOTION.snap)
          );
    } else {
      scale.value = reduceAnimations ? 0 : withSpring(0, MOTION.snap);
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
  const barWidth = useRef(0);

  const badges: Record<string, number> = { chat: unreadDMs, notifications: unreadNotifications };

  const visibleRoutes = state.routes.filter(r => !HIDDEN_ROUTES.has(r.name));
  const tabCount = visibleRoutes.length;
  const activeVisibleIndex = visibleRoutes.findIndex(r => r.name === state.routes[state.index].name);
  const bottom = insets.bottom > 0 ? insets.bottom + 8 : 16;

  // Elastic pill shared values
  const pillX = useSharedValue(0);
  const pillW = useSharedValue(0);
  const prevIndexRef = useRef(activeVisibleIndex);

  useEffect(() => {
    if (barWidth.current === 0 || tabCount === 0) return;
    const tabW = barWidth.current / tabCount;
    const targetX = activeVisibleIndex * tabW + tabW * 0.1;
    const baseW = tabW * 0.8;

    if (reduceAnimations) {
      pillX.value = targetX;
      pillW.value = baseW;
      prevIndexRef.current = activeVisibleIndex;
      return;
    }

    const prev = prevIndexRef.current;
    prevIndexRef.current = activeVisibleIndex;
    const dist = Math.abs(activeVisibleIndex - prev);
    const stretch = baseW + tabW * Math.min(dist, 2) * 0.5;

    // Stretch pill toward target, then contract
    pillW.value = withSequence(
      withSpring(stretch, MOTION.pressFirm),
      withSpring(baseW, MOTION.overshoot)
    );
    pillX.value = withSpring(targetX, { damping: 20, stiffness: 380, mass: 0.85 });
  }, [activeVisibleIndex, reduceAnimations]);

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: pillX.value }],
    width: pillW.value,
  }));

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
        <View
          style={{ flexDirection: 'row', flex: 1, alignItems: 'center' }}
          onLayout={(e) => {
            const w = e.nativeEvent.layout.width;
            if (w === barWidth.current) return;
            barWidth.current = w;
            const tabW = w / tabCount;
            const baseW = tabW * 0.8;
            const targetX = activeVisibleIndex * tabW + tabW * 0.1;
            pillX.value = targetX;
            pillW.value = baseW;
          }}
        >
          {/* Sliding elastic pill */}
          <Animated.View
            style={[{
              position: 'absolute',
              height: 36,
              borderRadius: 18,
              backgroundColor: colors.accentMuted,
              left: 0,
              top: 14,
            }, pillStyle]}
            pointerEvents="none"
          />

          {visibleRoutes.map(route => {
            const isFocused = state.routes[state.index].name === route.name;
            const IconComp = TAB_ICONS[route.name];
            if (!IconComp) return null;

            const color = isFocused ? colors.accent : colors.textMuted;
            const badgeCount = badges[route.name] ?? 0;

            return (
              <AnimatedPressable
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
                  if (route.name === 'chat') {
                    useCommandPalette.getState().open();
                    return;
                  }
                  navigation.emit({ type: 'tabLongPress', target: route.key });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
                depth="soft"
                fadeOnPress
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%', gap: 2 }}
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
              </AnimatedPressable>
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
