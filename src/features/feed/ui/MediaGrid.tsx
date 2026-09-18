import React, { useState } from 'react';
import {
  View, Pressable, Text, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { MagnifyingGlassPlus } from 'phosphor-react-native';
import { useTheme } from '../../../shared/lib/theme';
import { ZoomableImageViewer } from '../../../../components/ui/ZoomableImageViewer';
import { MEDIA_FADE_MS, mediaPlaceholderTint } from './mediaPlaceholder';

interface MediaGridProps {
  uris: string[];
  /** Fill this exact height instead of the default aspect heights (e.g. the
   *  full-bleed hero card). Multi-image grids split it across their rows. */
  height?: number;
  /** Whether the author permits their media to be saved to a device. */
  allowDownloads?: boolean;
}

/**
 * Every image in the grid, so the loading props are declared once.
 *
 * They were repeated across six call sites, which is how `recyclingKey` came to
 * be missing from all of them: a prop added to one branch is not added to the
 * other five. The three that matter are invisible until they are wrong —
 * without `recyclingKey` a recycled row shows the previous post's photo until
 * the new one decodes, and without a tint and a `transition` the image pops in
 * against grey.
 */
function GridImage({ uri }: { uri: string }) {
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%', backgroundColor: mediaPlaceholderTint(uri) }}
      contentFit="cover"
      cachePolicy="memory-disk"
      // Ties the decoded bitmap to this URI rather than to the recycled view,
      // so a cell that scrolls back into place cannot briefly show its
      // predecessor.
      recyclingKey={uri}
      transition={MEDIA_FADE_MS}
    />
  );
}

export function MediaGrid({ uris, height, allowDownloads = false }: MediaGridProps) {
  const { radius } = useTheme();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const count = uris.length;

  const open = (idx: number) => setViewerIndex(idx);
  const close = () => setViewerIndex(null);

  const r = radius.md;
  // When a fixed height is requested, drop the per-image border radius so the
  // media reads as one full-bleed surface (the card supplies the rounding).
  const rowRadius = height ? 0 : r;
  const rowH2 = height ? (height - 3) / 2 : 160;

  return (
    <>
      {/* 1 image */}
      {count === 1 && (
        <Pressable onPress={() => open(0)} style={{ borderRadius: height ? 0 : radius.card, overflow: 'hidden', height: height ?? 240 }}>
          <GridImage uri={uris[0]} />
          <ZoomHint />
        </Pressable>
      )}

      {/* 2 images */}
      {count === 2 && (
        <View style={{ flexDirection: 'row', gap: 3, height: height ?? 200 }}>
          {uris.map((uri, i) => (
            <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: rowRadius, overflow: 'hidden' }}>
              <GridImage uri={uri} />
            </Pressable>
          ))}
        </View>
      )}

      {/* 3 images */}
      {count === 3 && (
        <View style={{ flexDirection: 'row', gap: 3, height: height ?? 220 }}>
          <Pressable onPress={() => open(0)} style={{ flex: 1.4, borderRadius: rowRadius, overflow: 'hidden' }}>
            <GridImage uri={uris[0]} />
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            {uris.slice(1).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 1)} style={{ flex: 1, borderRadius: rowRadius, overflow: 'hidden' }}>
                <GridImage uri={uri} />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* 4 images */}
      {count >= 4 && (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 3, height: rowH2 }}>
            {uris.slice(0, 2).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: rowRadius, overflow: 'hidden' }}>
                <GridImage uri={uri} />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 3, height: rowH2 }}>
            {uris.slice(2, 4).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 2)} style={{ flex: 1, borderRadius: rowRadius, overflow: 'hidden' }}>
                <GridImage uri={uri} />
                {i === 1 && count > 4 && (
                  <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>+{count - 4}</Text>
                  </View>
                )}
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <ZoomableImageViewer
        visible={viewerIndex !== null}
        uris={uris}
        initialIndex={viewerIndex ?? 0}
        canDownload={allowDownloads}
        onClose={close}
      />
    </>
  );
}

function ZoomHint() {
  return (
    <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 5 }}>
      <MagnifyingGlassPlus color="#fff" size={14} />
    </View>
  );
}
