import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, Linking, StyleSheet, useWindowDimensions } from 'react-native';
import { ResponsiveScreen } from '../../components/ui/ResponsiveScreen';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, LinkSimple, Images as ImagesIcon } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { fetchConversationMedia, type ConversationMedia } from '../../lib/supabaseEchoApi';

export default function ChatMediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<'photos' | 'links'>('photos');
  const [media, setMedia] = useState<ConversationMedia>({ images: [], links: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    fetchConversationMedia(id)
      .then(m => { if (alive) setMedia(m); })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [id]);

  const cols = 3;
  const gap = 3;
  const size = (width - gap * (cols - 1)) / cols;

  return (
    <ResponsiveScreen>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 4, marginRight: 8 }}>
          <ArrowLeft color={colors.text} size={24} />
        </Pressable>
        <Text style={{ color: colors.text, fontSize: 18, fontFamily: 'Fraunces_600SemiBold' }}>Shared media</Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, padding: 12 }}>
        {(['photos', 'links'] as const).map(t => (
          <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="button"
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: tab === t ? colors.accent : colors.surfaceHover }}>
            <Text style={{ color: tab === t ? '#fff' : colors.textSecondary, fontSize: 13, fontWeight: '800' }}>
              {t === 'photos' ? `Photos${media.images.length ? ` · ${media.images.length}` : ''}` : `Links${media.links.length ? ` · ${media.links.length}` : ''}`}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'photos' ? (
        media.images.length === 0 ? (
          <Empty colors={colors} icon={<ImagesIcon color={colors.textMuted} size={34} />} text={loading ? 'Loading…' : 'No photos shared yet'} />
        ) : (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
            {media.images.map(img => (
              <Image key={img.id} source={{ uri: img.url }} style={{ width: size, height: size }} contentFit="cover" transition={120} />
            ))}
          </ScrollView>
        )
      ) : (
        media.links.length === 0 ? (
          <Empty colors={colors} icon={<LinkSimple color={colors.textMuted} size={34} />} text={loading ? 'Loading…' : 'No links shared yet'} />
        ) : (
          <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
            {media.links.map(l => (
              <Pressable key={l.id} onPress={() => void Linking.openURL(l.url)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 12 }}>
                <LinkSimple color={colors.accent} size={18} />
                <Text style={{ flex: 1, color: colors.text, fontSize: 13 }} numberOfLines={1}>{l.url}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )
      )}
    </ResponsiveScreen>
  );
}

function Empty({ colors, icon, text }: { colors: ReturnType<typeof useTheme>['colors']; icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: 60 }}>
      {icon}
      <Text style={{ color: colors.textMuted, fontSize: 14 }}>{text}</Text>
    </View>
  );
}
