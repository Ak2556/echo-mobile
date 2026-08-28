import React, { useEffect, useMemo } from 'react';
import { View, Text, Pressable, Image, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { ChatCircle, NotePencil, PaperPlaneTilt } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { ResponsiveScreen } from '../components/ui/ResponsiveScreen';
import { useTheme } from '../src/shared/lib/theme';
import { showToast } from '../components/ui/Toast';
import { createNote } from '../lib/notes';

/**
 * Something was shared to Echo from another app.
 *
 * Echo can do three genuinely different things with a link or a paragraph —
 * publish it, ask about it, or keep it — and which one the person meant is not
 * knowable from the payload. Guessing would be wrong two times in three, so
 * this asks, once, with the content visible above the choice.
 *
 * The intent is cleared on the way out. expo-share-intent holds it until it is
 * reset, and a stale payload would reappear the next time the app opened and
 * offer to publish something the user dealt with days ago.
 */
export default function ShareIntentScreen() {
  const router = useRouter();
  const { colors, font, radius } = useTheme();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();

  // Text and a shared URL arrive in different fields; for every action here
  // they are the same thing — words the user wants Echo to do something with.
  const body = useMemo(() => {
    const parts = [shareIntent?.text, shareIntent?.webUrl].filter(Boolean) as string[];
    return [...new Set(parts)].join('\n\n').trim();
  }, [shareIntent?.text, shareIntent?.webUrl]);

  const images = useMemo(
    () => (shareIntent?.files ?? []).filter(f => f.mimeType?.startsWith('image/')),
    [shareIntent?.files],
  );

  // Nothing to act on — usually a cold start onto this route with no payload.
  useEffect(() => {
    if (!hasShareIntent && !body && images.length === 0) router.replace('/(tabs)/home');
  }, [hasShareIntent, body, images.length, router]);

  const leave = (go: () => void) => {
    resetShareIntent();
    go();
  };

  const echoIt = () => leave(() => router.replace({
    pathname: '/create-post',
    params: {
      ...(body ? { prefillBody: body } : {}),
      ...(images.length
        ? { prefillImages: JSON.stringify(images.map(f => ({
            uri: f.path, mimeType: f.mimeType, fileName: f.fileName,
          }))) }
        : {}),
    },
  }));

  const askEcho = () => leave(() => router.replace({
    pathname: '/(tabs)/chat',
    params: { prompt: body },
  }));

  const keepIt = async () => {
    try {
      await createNote({ body });
      showToast('Saved to Notes', 'Saved');
    } catch {
      showToast('Could not save that', 'Error');
    }
    leave(() => router.replace('/(tabs)/home'));
  };

  const Action = ({ icon, label, hint, onPress, primary }: {
    icon: React.ReactNode; label: string; hint: string; onPress: () => void; primary?: boolean;
  }) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}. ${hint}`}>
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        padding: 16, borderRadius: radius.card,
        backgroundColor: primary ? colors.accent : colors.surface,
      }}>
        {icon}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[font.bodyBold, { color: primary ? colors.bg : colors.text, fontSize: 15 }]}>{label}</Text>
          <Text style={[font.body, { color: primary ? colors.bg : colors.textMuted, fontSize: 12, marginTop: 2, opacity: primary ? 0.8 : 1 }]}>
            {hint}
          </Text>
        </View>
      </View>
    </Pressable>
  );

  return (
    <ResponsiveScreen>
      <ScreenHeader title="Shared to Echo" />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!!body && (
          <View style={{ padding: 14, borderRadius: radius.card, backgroundColor: colors.surface }}>
            <Text numberOfLines={6} style={[font.body, { color: colors.text, fontSize: 14, lineHeight: 21 }]}>
              {body}
            </Text>
          </View>
        )}

        {images.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {images.map(f => (
              <Image
                key={f.path}
                source={{ uri: f.path }}
                style={{ width: 108, height: 144, borderRadius: radius.card, backgroundColor: colors.surface }}
              />
            ))}
          </ScrollView>
        )}

        <Action
          primary
          icon={<PaperPlaneTilt size={22} weight="fill" color={colors.bg} />}
          label="Echo this"
          hint="Publish it as a new echo"
          onPress={echoIt}
        />
        {!!body && (
          <Action
            icon={<ChatCircle size={22} weight="fill" color={colors.accent} />}
            label="Ask Echo"
            hint="Start a conversation about it"
            onPress={askEcho}
          />
        )}
        {!!body && (
          <Action
            icon={<NotePencil size={22} weight="fill" color={colors.accent} />}
            label="Keep it"
            hint="Save to Notes for later"
            onPress={keepIt}
          />
        )}
      </ScrollView>
    </ResponsiveScreen>
  );
}
