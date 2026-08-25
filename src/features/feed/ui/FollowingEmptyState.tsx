import React from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { UsersThree, Plus, Compass } from 'phosphor-react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../../shared/lib/theme';
import { UserRow } from './UserRow';
import { Avatar } from '../../../../components/ui/Avatar';
import { personName } from '../../../../lib/personName';

export function FollowingEmptyState({ suggestedUsers, onFollow }: any) {
  const { colors, font, fontSizes } = useTheme();
  const router = useRouter();

  return (
    <View style={{ flex: 1, paddingTop: 40, paddingHorizontal: 20 }}>
      <View style={{ alignItems: 'center', marginBottom: 32 }}>
        <View style={{ 
          width: 80, height: 80, borderRadius: 40, 
          backgroundColor: colors.surface, 
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 24,
          borderWidth: 1, borderColor: colors.border
        }}>
          <UsersThree color={colors.accent} size={40} weight="duotone" />
        </View>
        <Text style={[font.displayBlack, { color: colors.text, fontSize: 26, textAlign: 'center', marginBottom: 12, letterSpacing: -0.5 }]}>
          Your feed is quiet
        </Text>
        <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 16, textAlign: 'center', lineHeight: 24, maxWidth: 300 }]}>
          When you follow people, their latest echoes will show up here. Let&apos;s find some voices.
        </Text>
      </View>

      {suggestedUsers && suggestedUsers.length > 0 && (
        <View style={{ backgroundColor: colors.surface, borderRadius: 24, padding: 20, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 }}>
            <Compass color={colors.accent} size={18} weight="fill" />
            <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]}>Suggested Creators</Text>
          </View>
          
          <View style={{ gap: 12 }}>
            {suggestedUsers.slice(0, 5).map((user: any) => (
              <Pressable 
                key={user.id}
                onPress={() => router.push(`/user/${user.id}`)}
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
              >
                <Avatar name={user.displayName || user.username} url={user.avatarUrl} color={user.avatarColor} size={46} zoomable={false} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[font.bodyBold, { color: colors.text, fontSize: 15 }]} numberOfLines={1}>{personName(user)}</Text>
                  <Text style={[font.bodyMedium, { color: colors.textMuted, fontSize: 13 }]} numberOfLines={1}>@{user.username}</Text>
                </View>
                <Pressable 
                  onPress={(e) => { e.stopPropagation(); onFollow(user.id); }}
                  style={{ backgroundColor: colors.accent, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 }}
                >
                  <Text style={[font.bodyBold, { color: '#fff', fontSize: 13 }]}>Follow</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>

          <Pressable 
            onPress={() => router.push('/(tabs)/explore')}
            style={{ marginTop: 20, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, alignItems: 'center' }}
          >
            <Text style={[font.bodyBold, { color: colors.accent, fontSize: 15 }]}>Discover more people</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}
