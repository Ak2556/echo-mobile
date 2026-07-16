import React, { useState } from 'react';
import {
  View, Pressable, Text, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { MagnifyingGlassPlus } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { ZoomableImageViewer } from '../ui/ZoomableImageViewer';

interface MediaGridProps {
  uris: string[];
}

export function MediaGrid({ uris }: MediaGridProps) {
  const { radius } = useTheme();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const count = uris.length;

  const open = (idx: number) => setViewerIndex(idx);
  const close = () => setViewerIndex(null);

  const imgStyle = { width: '100%', height: '100%' } as const;
  const r = radius.md;

  return (
    <>
      {/* 1 image */}
      {count === 1 && (
        <Pressable onPress={() => open(0)} style={{ borderRadius: radius.card, overflow: 'hidden', height: 240 }}>
          <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
          <ZoomHint />
        </Pressable>
      )}

      {/* 2 images */}
      {count === 2 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 200 }}>
          {uris.map((uri, i) => (
            <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
              <Image source={{ uri }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
            </Pressable>
          ))}
        </View>
      )}

      {/* 3 images */}
      {count === 3 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 220 }}>
          <Pressable onPress={() => open(0)} style={{ flex: 1.4, borderRadius: r, overflow: 'hidden' }}>
            <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            {uris.slice(1).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 1)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* 4 images */}
      {count >= 4 && (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 3, height: 160 }}>
            {uris.slice(0, 2).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 3, height: 160 }}>
            {uris.slice(2, 4).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 2)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" cachePolicy="memory-disk" />
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
