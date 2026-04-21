import React, { useState } from 'react';
import {
  View, Modal, Pressable, Dimensions, StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { X, ZoomIn } from 'lucide-react-native';
import { useTheme } from '../../lib/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface MediaGridProps {
  uris: string[];
}

export function MediaGrid({ uris }: MediaGridProps) {
  const { radius } = useTheme();
  const [lightbox, setLightbox] = useState<string | null>(null);
  const count = uris.length;

  const open = (uri: string) => setLightbox(uri);
  const close = () => setLightbox(null);

  const imgStyle = { width: '100%', height: '100%' } as const;
  const r = radius.md;

  return (
    <>
      {/* ── 1 image ── */}
      {count === 1 && (
        <Pressable onPress={() => open(uris[0])} style={{ borderRadius: radius.card, overflow: 'hidden', height: 240 }}>
          <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" />
          <ZoomHint />
        </Pressable>
      )}

      {/* ── 2 images ── */}
      {count === 2 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 200 }}>
          {uris.map((uri, i) => (
            <Pressable key={i} onPress={() => open(uri)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
              <Image source={{ uri }} style={imgStyle} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      )}

      {/* ── 3 images: big left + 2 stacked right ── */}
      {count === 3 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 220 }}>
          <Pressable onPress={() => open(uris[0])} style={{ flex: 1.4, borderRadius: r, overflow: 'hidden' }}>
            <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" />
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            {uris.slice(1).map((uri, i) => (
              <Pressable key={i} onPress={() => open(uri)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" />
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* ── 4 images: 2×2 grid ── */}
      {count >= 4 && (
        <View style={{ gap: 3 }}>
          <View style={{ flexDirection: 'row', gap: 3, height: 160 }}>
            {uris.slice(0, 2).map((uri, i) => (
              <Pressable key={i} onPress={() => open(uri)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 3, height: 160 }}>
            {uris.slice(2, 4).map((uri, i) => (
              <Pressable key={i} onPress={() => open(uri)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" />
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

      {/* Lightbox */}
      <Modal visible={!!lightbox} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <Pressable
          onPress={close}
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', alignItems: 'center', justifyContent: 'center' }}
        >
          <Pressable onPress={close} style={{ position: 'absolute', top: 52, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20, padding: 8 }}>
            <X color="#fff" size={20} />
          </Pressable>
          {lightbox && (
            <Image
              source={{ uri: lightbox }}
              style={{ width: SCREEN_W, height: SCREEN_H * 0.75 }}
              contentFit="contain"
            />
          )}
        </Pressable>
      </Modal>
    </>
  );
}

function ZoomHint() {
  return (
    <View style={{ position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 12, padding: 5 }}>
      <ZoomIn color="#fff" size={14} />
    </View>
  );
}

// needed for the +N overlay
import { StyleSheet, Text } from 'react-native';
