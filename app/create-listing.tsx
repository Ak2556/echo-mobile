import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Camera, CheckCircle, Plus, Trash } from 'phosphor-react-native';
import { useTheme } from '../lib/theme';
import { AnimatedPressable } from '../components/ui/AnimatedPressable';
import { showToast } from '../components/ui/Toast';
import {
  CURRENCIES,
  CurrencyCode,
  formatPrice,
} from '../lib/currency';
import {
  LISTING_CATEGORIES,
  LISTING_CONDITIONS,
  ListingCategory,
  ListingCondition,
  createListing,
  uploadListingImages,
} from '../lib/marketplaceApi';

const MAX_PHOTOS = 6;

function PickerSheet<T extends string>({
  options,
  selected,
  onSelect,
  onClose,
  renderOption,
}: {
  options: readonly T[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
  renderOption?: (v: T) => string;
}) {
  const { colors, radius, fontSizes } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
      >
        <Pressable
          onPress={e => e.stopPropagation()}
          style={{
            backgroundColor: colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 8,
            paddingBottom: insets.bottom + 16,
          }}
        >
          <View style={{
            width: 36,
            height: 4,
            borderRadius: 2,
            backgroundColor: colors.border,
            alignSelf: 'center',
            marginBottom: 12,
          }} />
          {options.map(opt => (
            <Pressable
              key={opt}
              onPress={() => { onSelect(opt); onClose(); }}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 20,
                paddingVertical: 14,
              }}
            >
              <Text style={{ color: colors.text, fontSize: fontSizes.body }}>
                {renderOption ? renderOption(opt) : opt}
              </Text>
              {opt === selected && (
                <CheckCircle color={colors.accent} size={20} weight="fill" />
              )}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function CreateListingScreen() {
  const { colors, radius, fontSizes } = useTheme();
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

  const [sheet, setSheet] = useState<'currency' | 'category' | 'condition' | null>(null);
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

  const inputStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: fontSizes.body,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'Inter_400Regular',
  };

  const labelStyle = {
    color: colors.textMuted,
    fontSize: fontSizes.caption - 1,
    fontFamily: 'Inter_500Medium',
    marginBottom: 6,
  };

  const selectedCurrency = CURRENCIES.find(c => c.code === currency);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header */}
      <View style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
        paddingHorizontal: 16,
        backgroundColor: colors.bg,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}>
        <AnimatedPressable onPress={() => router.back()} hitSlop={12} fadeOnPress>
          <ArrowLeft color={colors.text} size={22} />
        </AnimatedPressable>
        <Text style={{ flex: 1, color: colors.text, fontSize: fontSizes.title, fontFamily: 'Inter_700Bold' }}>
          Sell something
        </Text>
        <AnimatedPressable
          onPress={handleSubmit}
          disabled={!canSubmit}
          fadeOnPress
          style={{
            backgroundColor: canSubmit ? colors.accent : colors.border,
            paddingHorizontal: 16,
            paddingVertical: 8,
            borderRadius: radius.full,
          }}
        >
          {saving
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={{ color: '#fff', fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Post</Text>
          }
        </AnimatedPressable>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: insets.bottom + 40 }}
          keyboardShouldPersistTaps="handled"
        >
          {/* Photos */}
          <View>
            <Text style={labelStyle}>Photos ({photos.length}/{MAX_PHOTOS})</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {photos.map((uri, i) => (
                <View key={uri + i} style={{ position: 'relative' }}>
                  <Image
                    source={{ uri }}
                    style={{ width: 96, height: 96, borderRadius: radius.md }}
                    contentFit="cover"
                  />
                  {i === 0 && (
                    <View style={{
                      position: 'absolute',
                      top: 4, left: 4,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      borderRadius: 6,
                      paddingHorizontal: 6, paddingVertical: 2,
                    }}>
                      <Text style={{ color: '#fff', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>Cover</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => removePhoto(i)}
                    hitSlop={8}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      backgroundColor: 'rgba(0,0,0,0.6)',
                      borderRadius: 10, width: 20, height: 20,
                      alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Trash color="#fff" size={12} weight="bold" />
                  </Pressable>
                </View>
              ))}
              {photos.length < MAX_PHOTOS && (
                <AnimatedPressable
                  onPress={pickPhotos}
                  fadeOnPress
                  style={{
                    width: 96, height: 96,
                    borderRadius: radius.md,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    borderStyle: 'dashed',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Camera color={colors.textMuted} size={24} />
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontFamily: 'Inter_500Medium' }}>Add photo</Text>
                </AnimatedPressable>
              )}
            </ScrollView>
          </View>

          {/* Title */}
          <View>
            <Text style={labelStyle}>Title *</Text>
            <TextInput
              style={inputStyle}
              placeholder="What are you selling?"
              placeholderTextColor={colors.textMuted}
              value={title}
              onChangeText={setTitle}
              maxLength={120}
              returnKeyType="next"
            />
          </View>

          {/* Description */}
          <View>
            <Text style={labelStyle}>Description</Text>
            <TextInput
              style={[inputStyle, { minHeight: 88, textAlignVertical: 'top' }]}
              placeholder="Describe the item — condition, size, details buyers need to know..."
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={2000}
              multiline
              returnKeyType="default"
            />
          </View>

          {/* Price + Currency */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Price *</Text>
              <TextInput
                style={inputStyle}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                value={priceText}
                onChangeText={t => setPriceText(t.replace(/[^0-9.,]/g, ''))}
                keyboardType="decimal-pad"
                returnKeyType="done"
              />
            </View>
            <View style={{ width: 130 }}>
              <Text style={labelStyle}>Currency</Text>
              <AnimatedPressable
                onPress={() => setSheet('currency')}
                fadeOnPress
                style={[inputStyle, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}
              >
                <Text style={{ fontSize: 16 }}>{selectedCurrency?.flag}</Text>
                <Text style={{ color: colors.text, fontSize: fontSizes.body, flex: 1, fontFamily: 'Inter_400Regular' }}>
                  {currency}
                </Text>
              </AnimatedPressable>
            </View>
          </View>

          {/* Preview price */}
          {price > 0 && (
            <Text style={{ color: colors.textMuted, fontSize: fontSizes.caption, fontFamily: 'Inter_400Regular', marginTop: -14 }}>
              Shows as: {formatPrice(price, currency)}
            </Text>
          )}

          {/* Category + Condition */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Category</Text>
              <AnimatedPressable
                onPress={() => setSheet('category')}
                fadeOnPress
                style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              >
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular' }}>
                  {category === 'All' ? 'Other' : category}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>▾</Text>
              </AnimatedPressable>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={labelStyle}>Condition</Text>
              <AnimatedPressable
                onPress={() => setSheet('condition')}
                fadeOnPress
                style={[inputStyle, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              >
                <Text style={{ color: colors.text, fontSize: fontSizes.body, fontFamily: 'Inter_400Regular' }}>
                  {condition}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>▾</Text>
              </AnimatedPressable>
            </View>
          </View>

          {/* Location */}
          <View>
            <Text style={labelStyle}>Location (optional)</Text>
            <TextInput
              style={inputStyle}
              placeholder="City, neighbourhood, or 'Ships nationally'"
              placeholderTextColor={colors.textMuted}
              value={location}
              onChangeText={setLocation}
              maxLength={80}
              returnKeyType="next"
            />
          </View>

          {/* Fulfillment */}
          <View>
            <Text style={labelStyle}>How to get it (optional)</Text>
            <TextInput
              style={inputStyle}
              placeholder="Pickup only, can ship, deliver locally..."
              placeholderTextColor={colors.textMuted}
              value={fulfillment}
              onChangeText={setFulfillment}
              maxLength={120}
              returnKeyType="next"
            />
          </View>

          {/* Tags */}
          <View>
            <Text style={labelStyle}>Tags (optional)</Text>
            <TextInput
              style={inputStyle}
              placeholder="vintage, leather, size-M — comma separated"
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

      {/* Pickers */}
      {sheet === 'currency' && (
        <PickerSheet
          options={CURRENCIES.map(c => c.code) as CurrencyCode[]}
          selected={currency}
          onSelect={setCurrency}
          onClose={() => setSheet(null)}
          renderOption={code => {
            const c = CURRENCIES.find(x => x.code === code);
            return c ? `${c.flag}  ${c.code} — ${c.label}` : code;
          }}
        />
      )}
      {sheet === 'category' && (
        <PickerSheet
          options={LISTING_CATEGORIES.filter(c => c !== 'All') as ListingCategory[]}
          selected={category === 'All' ? 'Other' : category}
          onSelect={setCategory}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'condition' && (
        <PickerSheet
          options={LISTING_CONDITIONS}
          selected={condition}
          onSelect={setCondition}
          onClose={() => setSheet(null)}
        />
      )}
    </View>
  );
}
