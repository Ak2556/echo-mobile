import React, { useMemo } from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../../lib/theme';

/**
 * Renders free-form Echo text with two tap-targets recognized:
 *   - @username: opens the mentioned user's profile
 *   - #hashtag: runs a search for that tag (or opens topic page)
 *
 * Used in FeedCard body, comments, daily-answers etc. so mentions feel
 * native rather than dead text.
 *
 * Implementation note: splits text on a single regex, then wraps each
 * matching token in a styled <Text> child with onPress. We use `Text`
 * children (not Pressable) so the linkified token wraps inline with
 * the rest of the prose.
 */

interface LinkifiedTextProps extends Omit<TextProps, 'children'> {
  text: string;
  /** Optional style override for the matching tokens. Defaults to accent color. */
  linkStyle?: TextStyle;
}

const TOKEN_RE = /(@[a-zA-Z0-9_]{2,32}|#[\wÀ-ɏ]+)/g;

export function LinkifiedText({ text, style, linkStyle, ...rest }: LinkifiedTextProps) {
  const router = useRouter();
  const { colors } = useTheme();

  const segments = useMemo(() => {
    if (!text) return [] as { kind: 'text' | 'mention' | 'tag'; value: string }[];
    // Split keeps the matched tokens so we can wrap them.
    const parts = text.split(TOKEN_RE);
    return parts.map((part) => {
      if (!part) return { kind: 'text' as const, value: '' };
      if (part.startsWith('@')) return { kind: 'mention' as const, value: part };
      if (part.startsWith('#')) return { kind: 'tag' as const, value: part };
      return { kind: 'text' as const, value: part };
    });
  }, [text]);

  const accent: TextStyle = { color: colors.accent, fontWeight: '600' };

  return (
    <Text style={style} {...rest}>
      {segments.map((seg, i) => {
        if (seg.kind === 'mention') {
          const username = seg.value.slice(1).toLowerCase();
          return (
            <Text
              key={i}
              style={[accent, linkStyle]}
              onPress={() => router.push(`/user/${username}`)}
              suppressHighlighting
            >
              {seg.value}
            </Text>
          );
        }
        if (seg.kind === 'tag') {
          const tag = seg.value;
          return (
            <Text
              key={i}
              style={[accent, linkStyle]}
              onPress={() => router.push({ pathname: '/(tabs)/explore', params: { q: tag } })}
              suppressHighlighting
            >
              {seg.value}
            </Text>
          );
        }
        return (
          <Text key={i}>{seg.value}</Text>
        );
      })}
    </Text>
  );
}
