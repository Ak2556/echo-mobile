import React, { useState, useMemo } from 'react';
import { View, Text, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ArrowLeft, Check } from 'phosphor-react-native';
import { TextInput } from '../components/ui/TextInput';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { useTheme } from '../lib/theme';
import { createSalon } from '../lib/supabaseEchoApi';
import { V2FeatureGuard } from '../components/common/V2FeatureGuard';

const COVER_COLORS = ['#7C3AED', '#EF4444', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#06B6D4', '#F97316'];
const NAME_MAX = 40;
const DESC_MAX = 240;

function CreateSalonScreenInner() {
  const router = useRouter();
  const { colors, radius, fontSizes, animation } = useTheme();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [topicTags, setTopicTags] = useState('');
  const [coverColor, setCoverColor] = useState(COVER_COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  // Auto-derive slug from name as the user types (unless the user has typed their own slug).
  const derivedSlug = useMemo(() => name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 32), [name]);
  const effectiveSlug = slug.trim() || derivedSlug;

  const canSubmit = name.trim().length >= 2 && effectiveSlug.length >= 3 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const tagList = topicTags
        .split(/[,\s]+/)
        .map(t => t.trim().replace(/^#/, ''))
        .filter(Boolean)
        .slice(0, 8);
      const salon = await createSalon({
        name: name.trim(),
        slug: effectiveSlug,
        description: description.trim() || undefined,
        cover_color: coverColor,
        topic_tags: tagList,
      });
      showToast('Salon created', 'Created');
      router.replace({ pathname: '/salon/[slug]', params: { slug: salon.slug } });
    } catch (e) {
      Alert.alert('Could not create salon', (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <AnimatedPressable onPress={() => router.back()} style={{ padding: 4 }} scaleValue={0.88} haptic="light">
          <ArrowLeft color={colors.text} size={24} />
        </AnimatedPressable>
        <Text style={{ color: colors.text, fontWeight: '700', fontSize: 18 }}>New Salon</Text>
        <AnimatedPressable
          onPress={() => void handleSubmit()}
          disabled={!canSubmit}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: radius.lg,
            backgroundColor: canSubmit ? colors.accent : colors.surfaceHover,
          }}
          scaleValue={0.93}
          haptic="medium"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Check color="#fff" size={15} weight="bold" />
          )}
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: fontSizes.small }}>Create</Text>
        </AnimatedPressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {/* Name */}
        <Animated.View entering={animation(FadeInDown.duration(220))} className="mb-4">
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Name</Text>
          <TextInput value={name} onChangeText={(t) => setName(t.slice(0, NAME_MAX))} placeholder="e.g. Long-form Thinkers" maxLength={NAME_MAX} />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, marginLeft: 4 }}>{name.length}/{NAME_MAX}</Text>
        </Animated.View>

        {/* Slug */}
        <Animated.View entering={animation(FadeInDown.delay(100).duration(220))} className="mb-4">
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>URL slug</Text>
          <TextInput
            value={slug || derivedSlug}
            onChangeText={(t) => setSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32))}
            placeholder="auto-from-name"
            autoCapitalize="none"
            maxLength={32}
          />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, marginLeft: 4 }}>
            People will find this salon at /salon/{effectiveSlug || '…'}
          </Text>
        </Animated.View>

        {/* Description */}
        <Animated.View entering={animation(FadeInDown.delay(200).duration(220))} className="mb-4">
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Description (optional)</Text>
          <TextInput
            value={description}
            onChangeText={(t) => setDescription(t.slice(0, DESC_MAX))}
            placeholder="What kind of thinking happens here?"
            multiline
          />
          <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, marginTop: 4, marginLeft: 4 }}>{description.length}/{DESC_MAX}</Text>
        </Animated.View>

        {/* Topic tags */}
        <Animated.View entering={animation(FadeInDown.delay(300).duration(220))} className="mb-4">
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Topics (comma-separated)</Text>
          <TextInput
            value={topicTags}
            onChangeText={setTopicTags}
            placeholder="philosophy, productivity, ai"
            autoCapitalize="none"
          />
        </Animated.View>

        {/* Cover color picker */}
        <Animated.View entering={animation(FadeInDown.delay(400).duration(220))} className="mb-6">
          <Text style={{ color: colors.textSecondary, fontSize: fontSizes.small, fontWeight: '500', marginBottom: 8, marginLeft: 4 }}>Cover color</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {COVER_COLORS.map((c) => {
              const active = coverColor === c;
              return (
                <AnimatedPressable
                  key={c}
                  onPress={() => setCoverColor(c)}
                  style={{
                    width: 40, height: 40, borderRadius: 99,
                    backgroundColor: c,
                    borderWidth: active ? 3 : 0,
                    borderColor: colors.text,
                    alignItems: 'center', justifyContent: 'center',
                  }}
                  scaleValue={0.9}
                  haptic="light"
                >
                  {active && <Check color="#fff" size={16} weight="bold" />}
                </AnimatedPressable>
              );
            })}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

export default function CreateSalonScreen() { return <V2FeatureGuard flag="salons"><CreateSalonScreenInner /></V2FeatureGuard>; }
