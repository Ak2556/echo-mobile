import React, { useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { DownloadSimple, X } from 'phosphor-react-native';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { showToast } from '../ui/Toast';
import { useTheme } from '../../lib/theme';

interface PhotoGalleryProps {
  urls: string[];
  /** Show as horizontal strip; tap photo to open fullscreen modal */
  compact?: boolean;
}

function FullscreenViewer({
  urls,
  initialIndex,
  onClose,
}: {
  urls: string[];
  initialIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(initialIndex);
  const [saving, setSaving] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const url = urls[index];
      const ext = url.split('?')[0].split('.').pop() ?? 'jpg';
      const dest = `${FileSystem.cacheDirectory}marketplace_photo.${ext}`;
      await FileSystem.downloadAsync(url, dest);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(dest, { mimeType: 'image/jpeg', UTI: 'public.jpeg' });
      } else {
        showToast('Sharing not available on this device', 'Info');
      }
    } catch {
      showToast('Could not download photo', 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        {/* Controls */}
        <View style={{
          position: 'absolute',
          top: insets.top + 8,
          left: 0,
          right: 0,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          zIndex: 10,
        }}>
          <Pressable
            onPress={onClose}
            hitSlop={16}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <X color="#fff" size={20} />
          </Pressable>

          <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' }}>
            {index + 1} / {urls.length}
          </Text>

          <Pressable
            onPress={handleSave}
            hitSlop={16}
            style={{
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(0,0,0,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: saving ? 0.5 : 1,
            }}
          >
            <DownloadSimple color="#fff" size={20} weight="bold" />
          </Pressable>
        </View>

        {/* Horizontal page scroll */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: initialIndex * width, y: 0 }}
          onMomentumScrollEnd={e => {
            const page = Math.round(e.nativeEvent.contentOffset.x / width);
            setIndex(page);
          }}
          style={{ flex: 1 }}
        >
          {urls.map((url, i) => (
            // Each page has its own pinch-zoomable ScrollView
            <ScrollView
              key={url + i}
              style={{ width, height }}
              contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}
              maximumZoomScale={4}
              minimumZoomScale={1}
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
              bouncesZoom
              centerContent
            >
              <Image
                source={{ uri: url }}
                style={{ width, height }}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </ScrollView>
          ))}
        </ScrollView>

        {/* Dot indicator */}
        {urls.length > 1 && (
          <View style={{
            position: 'absolute',
            bottom: insets.bottom + 24,
            left: 0,
            right: 0,
            flexDirection: 'row',
            justifyContent: 'center',
            gap: 6,
          }}>
            {urls.map((_, i) => (
              <View
                key={i}
                style={{
                  width: i === index ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === index ? '#fff' : 'rgba(255,255,255,0.35)',
                }}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

export function PhotoGallery({ urls, compact }: PhotoGalleryProps) {
  const { radius } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  if (!urls || urls.length === 0) return null;

  if (compact) {
    return (
      <>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
        >
          {urls.map((url, i) => (
            <AnimatedPressable
              key={url + i}
              onPress={() => setViewerIndex(i)}
              depth="medium"
              fadeOnPress
              style={{ borderRadius: radius.md, overflow: 'hidden' }}
            >
              <Image
                source={{ uri: url }}
                style={{ width: 120, height: 120, borderRadius: radius.md }}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            </AnimatedPressable>
          ))}
        </ScrollView>
        {viewerIndex !== null && (
          <FullscreenViewer
            urls={urls}
            initialIndex={viewerIndex}
            onClose={() => setViewerIndex(null)}
          />
        )}
      </>
    );
  }

  // Full-width layout for detail view
  const mainHeight = Math.round(Math.min(screenWidth, 760) * 0.75);

  return (
    <>
      <View>
        {/* Main large photo */}
        <AnimatedPressable
          onPress={() => setViewerIndex(0)}
          depth="soft"
          fadeOnPress
          style={{ borderRadius: radius.card, overflow: 'hidden', marginBottom: urls.length > 1 ? 8 : 0 }}
        >
          <Image
            source={{ uri: urls[0] }}
            style={{ width: '100%', height: mainHeight }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
          {urls.length > 1 && (
            <View style={{
              position: 'absolute',
              bottom: 10,
              right: 10,
              backgroundColor: 'rgba(0,0,0,0.55)',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 4,
            }}>
              <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                1 / {urls.length}
              </Text>
            </View>
          )}
        </AnimatedPressable>

        {/* Thumbnail strip */}
        {urls.length > 1 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {urls.slice(1).map((url, i) => (
              <AnimatedPressable
                key={url + i}
                onPress={() => setViewerIndex(i + 1)}
                depth="medium"
                fadeOnPress
                style={{ borderRadius: 10, overflow: 'hidden' }}
              >
                <Image
                  source={{ uri: url }}
                  style={{ width: 72, height: 72, borderRadius: 10 }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              </AnimatedPressable>
            ))}
          </ScrollView>
        )}
      </View>

      {viewerIndex !== null && (
        <FullscreenViewer
          urls={urls}
          initialIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  );
}
