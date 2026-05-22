import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SealCheck } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { searchRemoteUsers, UserSearchHit } from '../../lib/supabaseEchoApi';

interface MentionSuggestionsProps {
  /** Current full text of the input the user is typing in. */
  text: string;
  /** Current caret position (selection.start). */
  caret: number;
  /** Called with the username to insert (no leading @). */
  onPick: (hit: UserSearchHit) => void;
  /** Optional bottom offset — number of pixels to push the dropdown up. */
  bottom?: number;
}

/**
 * Detect the active `@token` immediately before the caret.
 * Returns the token (sans @) and its start index in the source string,
 * or null if the caret isn't inside a mention.
 */
export function activeMentionToken(text: string, caret: number): { token: string; start: number } | null {
  if (caret <= 0 || caret > text.length) return null;
  // Walk backwards from caret. A mention runs from the most recent '@' that
  // is either at string start or preceded by whitespace, up to the caret.
  let i = caret - 1;
  while (i >= 0) {
    const ch = text[i];
    if (ch === '@') {
      const before = i === 0 ? ' ' : text[i - 1];
      if (/\s/.test(before)) {
        const token = text.slice(i + 1, caret);
        if (!/^[a-zA-Z0-9_]*$/.test(token)) return null;
        return { token, start: i };
      }
      return null;
    }
    if (!/[a-zA-Z0-9_]/.test(ch)) return null; // broke out of word chars before finding @
    i--;
  }
  return null;
}

/**
 * Floating dropdown that suggests usernames as the user types `@`.
 *
 * Stays mounted; renders nothing when the caret isn't inside an `@token`.
 * Debounces the search request to avoid hammering Supabase on every keystroke.
 */
export function MentionSuggestions({ text, caret, onPick, bottom = 64 }: MentionSuggestionsProps) {
  const { colors, fontSizes, radius } = useTheme();
  const [hits, setHits] = useState<UserSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);

  const active = useMemo(() => activeMentionToken(text, caret), [text, caret]);

  useEffect(() => {
    if (!active) {
      setHits([]);
      setLoading(false);
      return;
    }
    const myId = ++reqId.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await searchRemoteUsers(active.token || '', 6);
      // Drop stale results.
      if (myId === reqId.current) {
        setHits(res);
        setLoading(false);
      }
    }, 140);
    return () => clearTimeout(t);
  }, [active]);

  if (!active) return null;
  if (!loading && hits.length === 0 && active.token.length === 0) return null;

  return (
    <View
      style={{
        position: 'absolute',
        left: 16,
        right: 16,
        bottom,
        backgroundColor: colors.surface,
        borderRadius: radius.card,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 8,
        overflow: 'hidden',
        maxHeight: 240,
        zIndex: 50,
      }}
    >
      {loading && hits.length === 0 ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color={colors.accent} size="small" />
        </View>
      ) : hits.length === 0 ? (
        <View style={{ paddingVertical: 14, paddingHorizontal: 14 }}>
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.small }}>No matches for “@{active.token}”</Text>
        </View>
      ) : (
        hits.map((u, i) => (
          <Pressable
            key={u.id}
            onPress={() => onPick(u)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 12,
              paddingVertical: 10,
              backgroundColor: pressed ? colors.surfaceHover : 'transparent',
              borderTopWidth: i === 0 ? 0 : 0.5,
              borderTopColor: colors.border,
            })}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: u.avatar_color || colors.accent,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: 10,
              }}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>
                {(u.display_name || u.username).charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: fontSizes.small }} numberOfLines={1}>
                  {u.display_name || u.username}
                </Text>
                {u.is_verified && <SealCheck color={colors.accent} size={12} weight="fill" />}
              </View>
              <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption }}>@{u.username}</Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

/**
 * Replace the active `@token` (preceding the caret) with `@username `.
 * Returns the new text and the new caret position.
 */
export function applyMentionPick(text: string, caret: number, username: string): { text: string; caret: number } {
  const active = activeMentionToken(text, caret);
  if (!active) return { text, caret };
  const before = text.slice(0, active.start);
  const after = text.slice(caret);
  const insert = `@${username} `;
  return { text: before + insert + after, caret: before.length + insert.length };
}
