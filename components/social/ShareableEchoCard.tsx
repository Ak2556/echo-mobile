import React, { forwardRef } from 'react';
import { View, Text } from 'react-native';
import { FeedItem } from '../../types';
import { useTheme } from '../../lib/theme';

interface ShareableEchoCardProps {
  item: FeedItem;
}

/**
 * Brand-aligned shareable card. Sized to a portrait aspect that reads well
 * on every social platform (1080×1350 — Instagram feed safe + readable on
 * X). Rendered off-screen behind everything else, captured to PNG via
 * react-native-view-shot, then handed to the system share sheet.
 *
 * Visual rules:
 *   - One accent rule above the prompt (pull-quote treatment, matches feed)
 *   - Prompt in italic, response below in body weight
 *   - Author avatar + @handle at the bottom
 *   - Wordmark "echo." in the bottom-right as light watermark
 *   - Background uses theme bg so screenshots match the in-app card
 *
 * Don't render this directly — use `useEchoImage(item)` which wraps the
 * capture flow.
 */
export const ShareableEchoCard = forwardRef<View, ShareableEchoCardProps>(({ item }, ref) => {
  const { colors, font } = useTheme();

  const prompt = item.editorialTitle ?? item.prompt;
  const response = item.authorNote ?? item.response;

  return (
    <View
      ref={ref}
      collapsable={false}
      style={{
        width: 1080,
        height: 1350,
        backgroundColor: colors.bg,
        padding: 96,
        justifyContent: 'space-between',
      }}
    >
      {/* Top — prompt as pull-quote */}
      <View style={{ flexDirection: 'row', marginBottom: 36, marginTop: 24 }}>
        <View style={{ width: 6, backgroundColor: colors.accent, borderRadius: 3, marginRight: 36, opacity: 0.9 }} />
        <Text
          style={[
            font.quote,
            { color: colors.textSecondary, fontSize: 44, lineHeight: 64, flex: 1 },
          ]}
          numberOfLines={4}
        >
          {prompt}
        </Text>
      </View>

      {/* Middle — the response, the headline */}
      <Text
        style={[
          font.bodyMedium,
          { color: colors.text, fontSize: 56, lineHeight: 80, letterSpacing: -0.4, flex: 1 },
        ]}
        numberOfLines={8}
      >
        {response}
      </Text>

      {/* Bottom — author + wordmark */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginTop: 48,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: item.avatarColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={[font.bodyBold, { color: '#fff', fontSize: 28 }]}>
              {(item.displayName || item.username).charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={[font.bodySemibold, { color: colors.text, fontSize: 28 }]}>
              {item.displayName || item.username}
            </Text>
            <Text style={[font.body, { color: colors.textMuted, fontSize: 22, marginTop: 4 }]}>
              @{item.username}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[font.displayBlack, { color: colors.textMuted, fontSize: 36, letterSpacing: -0.8 }]}>
            echo
          </Text>
          <Text style={[font.displayBlack, { color: colors.accent, fontSize: 36, letterSpacing: -0.8 }]}>
            .
          </Text>
        </View>
      </View>
    </View>
  );
});

ShareableEchoCard.displayName = 'ShareableEchoCard';
