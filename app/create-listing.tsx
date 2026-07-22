import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Plus, X } from 'phosphor-react-native';
import { ScreenHeader } from '../components/ui/ScreenHeader';
import { useTheme } from '../lib/theme';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import { CURRENCIES, CurrencyCode, formatPrice, getCurrencySymbol } from '../lib/currency';
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  ListingCategory,
  ListingCondition,
  createListing,
  uploadListingImages,
} from '../lib/marketplaceApi';

const MAX_PHOTOS = 6;

function Eyebrow({ children, style }: { children: React.ReactNode; style?: object }) {
  const { colors } = useTheme();
  return (
    <Text style={[{
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: 'Inter_600SemiBold',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    }, style]}>
      {children}
    </Text>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress}>
      <View style={{
        paddingHorizontal: 14,
        paddingVertical: 9,
        borderRadius: 999,
        backgroundColor: active ? colors.accent : (colors.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'),
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: active ? 'transparent' : colors.border,
      }}>
        <Text style={{
          color: active ? '#fff' : colors.text,
          fontSize: 13.5,
          fontFamily: active ? 'Inter_600SemiBold' : 'Inter_500Medium',
        }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

export default function CreateListingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [photos, setPhotos] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceText, setPriceText] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('INR');
  const [category, setCategory] = useState<ListingCategory>('Other');
  const [condition, setCondition] = useState<ListingCondition>('Good');
  const [location, setLocation] = useState('');
  const [fulfillment, setFulfillment] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [saving, setSaving] = useState(false);

  const price = parseFloat(priceText.replace(/,/g, '')) || 0;
  const canSubmit = title.trim().length >= 3 && price >= 0 && !saving;

  const pickPhotos = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.85,
      selectionLimit: MAX_PHOTOS - photos.length,
    });
    if (!result.canceled) {
      setPhotos(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, MAX_PHOTOS));
    }
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      let uploadedUrls: string[] = [];
      if (photos.length > 0) {
        uploadedUrls = await uploadListingImages(photos);
      }
      const tags = tagsText
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .slice(0, 10);
      await createListing({
        title: title.trim(),
        description: description.trim(),
        price,
        currency,
        category,
        condition,
        photoUrls: uploadedUrls,
        tags,
        locationLabel: location.trim(),
        fulfillment: fulfillment.trim(),
      });
      showToast('Listing posted!', 'CheckCircle');
      router.back();
    } catch (e: any) {
      showToast(e?.message ?? 'Could not post listing', 'Error');
    } finally {
      setSaving(false);
    }
  };

  const softField = {
    backgroundColor: colors.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Inter_400Regular',
  };

  const hairline = {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 24,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader
        title="Sell something"
        safeTop
        right={
          <AnimatedPressable onPress={handleSubmit} disabled={!canSubmit} fadeOnPress style={{ marginRight: 6 }}>
            <View style={{
              backgroundColor: canSubmit ? colors.accent : (colors.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)'),
              paddingHorizontal: 18,
              paddingVertical: 9,
              borderRadius: 999,
            }}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: canSubmit ? '#fff' : colors.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Post</Text>
              }
            </View>
          </AnimatedPressable>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 48 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photos */}
          {photos.length === 0 ? (
            <Pressable onPress={pickPhotos}>
              <View style={{ borderRadius: 24, overflow: 'hidden', backgroundColor: colors.surface }}>
                <LinearGradient
                  colors={[`${colors.accent}2E`, `${colors.accent}0E`, 'transparent']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.9, y: 1 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <View style={{ alignItems: 'center', paddingVertical: 44, gap: 10 }}>
                  <Camera color={colors.accent} size={30} weight="fill" />
                  <Text style={{ color: colors.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>Add photos</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 12.5 }}>
                    Listings with photos sell faster · up to {MAX_PHOTOS}
                  </Text>
                </View>
              </View>
            </Pressable>
          ) : (
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 }}>
                <Eyebrow>Photos</Eyebrow>
                <Text style={{ color: colors.textMuted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{photos.length}/{MAX_PHOTOS}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                {photos.map((uri, i) => (
                  <View key={uri + i}>
                    <Image
                      source={{ uri }}
                      style={{ width: 110, height: 110, borderRadius: 18 }}
                      contentFit="cover"
                    />
                    {i === 0 && (
                      <View style={{
                        position: 'absolute',
                        bottom: 6, left: 6,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        borderRadius: 7,
                        paddingHorizontal: 7, paddingVertical: 3,
                      }}>
                        <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.4 }}>COVER</Text>
                      </View>
                    )}
                    <Pressable
                      onPress={() => removePhoto(i)}
                      hitSlop={8}
                      style={{
                        position: 'absolute', top: 6, right: 6,
                        backgroundColor: 'rgba(0,0,0,0.6)',
                        borderRadius: 11, width: 22, height: 22,
                        alignItems: 'center', justifyContent: 'center',
                      }}
                    >
                      <X color="#fff" size={12} weight="bold" />
                    </Pressable>
                  </View>
                ))}
                {photos.length < MAX_PHOTOS && (
                  <Pressable onPress={pickPhotos}>
                    <View style={{
                      width: 110, height: 110,
                      borderRadius: 18,
                      borderWidth: 1.5,
                      borderColor: colors.accent + '55',
                      borderStyle: 'dashed',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 5,
                      backgroundColor: colors.accent + '0A',
                    }}>
                      <Plus color={colors.accent} size={20} weight="bold" />
                      <Text style={{ color: colors.accent, fontSize: 11.5, fontFamily: 'Inter_600SemiBold' }}>Add more</Text>
                    </View>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          )}

          {/* The item */}
          <View style={hairline} />
          <Eyebrow style={{ marginBottom: 14 }}>The item</Eyebrow>

          <TextInput
            style={{
              color: colors.text,
              fontSize: 22,
              fontFamily: 'Inter_600SemiBold',
              letterSpacing: -0.3,
              paddingVertical: 6,
            }}
            placeholder="What are you selling?"
            placeholderTextColor={colors.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={120}
            returnKeyType="next"
          />
          <TextInput
            style={{
              color: colors.textSecondary,
              fontSize: 15,
              lineHeight: 22,
              fontFamily: 'Inter_400Regular',
              minHeight: 66,
              textAlignVertical: 'top',
              paddingVertical: 6,
              marginTop: 4,
            }}
            placeholder="Describe it — condition, size, what a buyer should know…"
            placeholderTextColor={colors.textMuted}
            value={description}
            onChangeText={setDescription}
            maxLength={2000}
            multiline
          />

          {/* Price */}
          <View style={hairline} />
          <Eyebrow style={{ marginBottom: 14 }}>Price</Eyebrow>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <Text style={{ color: colors.accent, fontSize: 32, fontFamily: 'Fraunces_600SemiBold', marginRight: 6, marginBottom: 2 }}>
              {getCurrencySymbol(currency)}
            </Text>
            <TextInput
              style={{
                flex: 1,
                color: colors.text,
                fontSize: 40,
                fontFamily: 'Fraunces_600SemiBold',
                letterSpacing: -1,
                paddingVertical: 0,
              }}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              value={priceText}
              onChangeText={t => setPriceText(t.replace(/[^0-9.,]/g, ''))}
              keyboardType="decimal-pad"
              returnKeyType="done"
            />
          </View>
          {price > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: 12.5, marginTop: 4 }}>
              Shows as {formatPrice(price, currency)}
            </Text>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 14 }}>
            {CURRENCIES.map(c => (
              <Chip key={c.code} label={`${c.symbol} ${c.code}`} active={currency === c.code} onPress={() => setCurrency(c.code)} />
            ))}
          </ScrollView>

          {/* Category */}
          <View style={hairline} />
          <Eyebrow style={{ marginBottom: 12 }}>Category</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {(LISTING_CATEGORIES.filter(c => c !== 'All') as ListingCategory[]).map(c => (
              <Chip key={c} label={c} active={(category === 'All' ? 'Other' : category) === c} onPress={() => setCategory(c)} />
            ))}
          </View>

          <Eyebrow style={{ marginTop: 22, marginBottom: 12 }}>Condition</Eyebrow>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {LISTING_CONDITIONS.map(c => (
              <Chip key={c} label={c} active={condition === c} onPress={() => setCondition(c)} />
            ))}
          </View>

          {/* Details */}
          <View style={hairline} />
          <Eyebrow style={{ marginBottom: 14 }}>Details</Eyebrow>
          <View style={{ gap: 12 }}>
            <TextInput
              style={softField}
              placeholder="Location — city, area, or 'Ships nationally'"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
              maxLength={80}
              returnKeyType="next"
            />
            <TextInput
              style={softField}
              placeholder="How to get it — pickup, shipping, local delivery…"
              placeholderTextColor={colors.textMuted}
              value={fulfillment}
              onChangeText={setFulfillment}
              maxLength={120}
              returnKeyType="next"
            />
            <TextInput
              style={softField}
              placeholder="Tags — vintage, leather, size-M (comma separated)"
              placeholderTextColor={colors.textMuted}
              value={tagsText}
              onChangeText={setTagsText}
              maxLength={200}
              returnKeyType="done"
              autoCapitalize="none"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
