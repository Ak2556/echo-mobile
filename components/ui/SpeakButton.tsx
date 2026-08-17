import React from 'react';
import { Pressable } from 'react-native';
import { SpeakerHigh } from 'phosphor-react-native';
import { useTheme } from '../../src/shared/lib/theme';
import { tap } from '../../src/shared/lib/haptics';
import { isTtsAvailable, toggleSpeak, useTtsStore, type SpeakOptions } from '../../lib/tts';

/**
 * A tap-to-read-aloud speaker. Reads `text` in the app's (or given) language via
 * on-device TTS, toggling stop when tapped again. Reflects the speaking state
 * (filled + accent) and renders nothing until TTS is available (next native
 * build), so it never shows a dead control.
 */
export function SpeakButton({
  text,
  id,
  language,
  size = 18,
  color,
  hitSlop = 10,
}: {
  text: string;
  id: string;
  language?: SpeakOptions['language'];
  size?: number;
  color?: string;
  hitSlop?: number;
}) {
  const { colors } = useTheme();
  const speaking = useTtsStore((s) => s.speakingId === id);
  if (!isTtsAvailable() || !text?.trim()) return null;
  const tint = speaking ? colors.accent : color ?? colors.textMuted;
  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        tap('light');
        toggleSpeak(text, { id, language });
      }}
      hitSlop={hitSlop}
      accessibilityRole="button"
      accessibilityLabel={speaking ? 'Stop reading' : 'Read aloud'}
    >
      <SpeakerHigh color={tint} size={size} weight={speaking ? 'fill' : 'regular'} />
    </Pressable>
  );
}
