import React from 'react';
import { View, Text, Pressable, Linking } from 'react-native';
import { useTheme } from '../../lib/theme';

interface InlineVideoProps {
  uri: string;
  caption?: string;
}

export function InlineVideo({ uri, caption }: InlineVideoProps) {
  const { colors, radius, fontSizes } = useTheme();

  const handlePlay = () => {
    Linking.openURL(uri).catch(() => {});
  };

  return (
    <View style={{ marginBottom: 12 }}>
      {!!caption && (
        <Text style={{ color: colors.text, fontSize: fontSizes.body, marginBottom: 10 }} numberOfLines={2}>
          {caption}
        </Text>
      )}
      <Pressable
        onPress={handlePlay}
        style={{
          borderRadius: radius.card,
          overflow: 'hidden',
          height: 210,
          backgroundColor: '#0a0a0a',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Gradient-style dark background with subtle grid */}
        <View style={{ position: 'absolute', inset: 0, backgroundColor: '#111827' }} />
        <View style={{ position: 'absolute', inset: 0, opacity: 0.08 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <View key={i} style={{ height: 1, backgroundColor: '#fff', marginTop: 25 }} />
          ))}
        </View>

        {/* Play button */}
        <View style={{
          width: 68, height: 68, borderRadius: 34,
          backgroundColor: 'rgba(255,255,255,0.15)',
          borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)',
          alignItems: 'center', justifyContent: 'center',
          marginBottom: 14,
        }}>
          {/* Triangle */}
          <View style={{
            width: 0, height: 0,
            borderTopWidth: 13, borderBottomWidth: 13, borderLeftWidth: 22,
            borderTopColor: 'transparent', borderBottomColor: 'transparent',
            borderLeftColor: '#fff',
            marginLeft: 5,
          }} />
        </View>

        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: fontSizes.small, fontWeight: '600', letterSpacing: 0.5 }}>
          Tap to watch
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: fontSizes.caption, marginTop: 4 }}>
          Opens in browser
        </Text>
      </Pressable>
    </View>
  );
}
