import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Search, MessageSquare, Bell, User } from 'lucide-react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withSequence, FadeIn } from 'react-native-reanimated';
import { useTheme } from '../../lib/theme';
import { useAppStore } from '../../store/useAppStore';

function BadgeIcon({ children, count }: { children: React.ReactNode; count: number }) {
  const { colors, reduceAnimations } = useTheme();
  const scale = useSharedValue(0);

  useEffect(() => {
    if (count > 0) {
      if (reduceAnimations) {
        scale.value = 1;
      } else {
        scale.value = withSequence(
          withSpring(1.3, { damping: 6, stiffness: 300 }),
          withSpring(1, { damping: 10, stiffness: 300 })
        );
      }
    } else {
      scale.value = reduceAnimations ? 0 : withSpring(0, { damping: 12, stiffness: 300 });
    }
  }, [count]);

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

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
            minWidth: 16,
            height: 16,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 4,
          },
          badgeStyle,
        ]}
      >
        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
          {count > 99 ? '99+' : count}
        </Text>
      </Animated.View>
    </View>
  );
}

export default function TabLayout() {
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.tabBar,
          borderTopColor: colors.tabBorder,
          borderTopWidth: 0.5,
          height: 85,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="discover"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => <Home color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => <Search color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Echo',
          tabBarIcon: ({ color }) => (
            <BadgeIcon count={unreadDMs}>
              <MessageSquare color={color} size={22} />
            </BadgeIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color }) => (
            <BadgeIcon count={unreadNotifications}>
              <Bell color={color} size={22} />
            </BadgeIcon>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User color={color} size={22} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
