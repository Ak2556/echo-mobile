import React from 'react';
import { View, Text } from 'react-native';
import { Tabs } from 'expo-router';
import { Home, Search, MessageSquare, Bell, User } from 'lucide-react-native';
import { useAppStore } from '../../store/useAppStore';

function BadgeIcon({ children, count }: { children: React.ReactNode; count: number }) {
  return (
    <View>
      {children}
      {count > 0 && (
        <View className="absolute -top-1 -right-2 bg-red-500 rounded-full min-w-[16px] h-4 items-center justify-center px-1">
          <Text className="text-white text-[10px] font-bold">{count > 99 ? '99+' : count}</Text>
        </View>
      )}
    </View>
  );
}

export default function TabLayout() {
  const unreadNotifications = useAppStore(s => s.unreadNotificationCount());
  const unreadDMs = useAppStore(s => s.totalUnreadDMs());

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#1C1C1E',
          borderTopWidth: 0.5,
          height: 85,
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#fff',
        tabBarInactiveTintColor: '#71717A',
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
