import React, { useState } from 'react';
import {
  View, Modal, Pressable, Dimensions, Text, StyleSheet,
} from 'react-native';
import { Image } from 'expo-image';
import { X, MagnifyingGlassPlus, CaretLeft, CaretRight } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

interface MediaGridProps {
  uris: string[];
}

export function MediaGrid({ uris }: MediaGridProps) {
  const { radius } = useTheme();
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const count = uris.length;

  const open = (idx: number) => { setCurrentIdx(idx); setLightboxIdx(idx); };
  const close = () => setLightboxIdx(null);
  const prev = () => setCurrentIdx(i => Math.max(0, i - 1));
  const next = () => setCurrentIdx(i => Math.min(uris.length - 1, i + 1));

  const imgStyle = { width: '100%', height: '100%' } as const;
  const r = radius.md;

  return (
    <>
      {/* ── 1 image ── */}
      {count === 1 && (
        <Pressable onPress={() => open(0)} style={{ borderRadius: radius.card, overflow: 'hidden', height: 240 }}>
          <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" />
          <ZoomHint />
        </Pressable>
      )}

      {/* ── 2 images ── */}
      {count === 2 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 200 }}>
          {uris.map((uri, i) => (
            <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
              <Image source={{ uri }} style={imgStyle} contentFit="cover" />
            </Pressable>
          ))}
        </View>
      )}

      {/* ── 3 images: big left + 2 stacked right ── */}
      {count === 3 && (
        <View style={{ flexDirection: 'row', gap: 3, height: 220 }}>
          <Pressable onPress={() => open(0)} style={{ flex: 1.4, borderRadius: r, overflow: 'hidden' }}>
            <Image source={{ uri: uris[0] }} style={imgStyle} contentFit="cover" />
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            {uris.slice(1).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 1)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
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
              <Pressable key={i} onPress={() => open(i)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
                <Image source={{ uri }} style={imgStyle} contentFit="cover" />
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 3, height: 160 }}>
            {uris.slice(2, 4).map((uri, i) => (
              <Pressable key={i} onPress={() => open(i + 2)} style={{ flex: 1, borderRadius: r, overflow: 'hidden' }}>
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
      <Modal visible={lightboxIdx !== null} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)', alignItems: 'center', justifyContent: 'center' }}>
          {/* Close button */}
          <Pressable
            onPress={close}
            style={{ position: 'absolute', top: 52, right: 20, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 20, padding: 8 }}
          >
            <X color="#fff" size={20} />
          </Pressable>

          {/* Page counter */}
          {uris.length > 1 && (
            <Text style={{ position: 'absolute', top: 58, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', zIndex: 10 }}>
              {currentIdx + 1} / {uris.length}
            </Text>
          )}

          {/* Image */}
          <Image
            source={{ uri: uris[currentIdx] }}
            style={{ width: SCREEN_W, height: SCREEN_H * 0.75 }}
            contentFit="contain"
          />

          {/* Prev / Next arrows */}
          {uris.length > 1 && (
            <>
              {currentIdx > 0 && (
                <Pressable
                  onPress={prev}
                  style={{ position: 'absolute', left: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, padding: 10 }}
                >
                  <CaretLeft color="#fff" size={22} weight="bold" />
                </Pressable>
              )}
              {currentIdx < uris.length - 1 && (
                <Pressable
                  onPress={next}
                  style={{ position: 'absolute', right: 12, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, padding: 10 }}
                >
                  <CaretRight color="#fff" size={22} weight="bold" />
                </Pressable>
              )}
            </>
          )}

          {/* Dot pagination */}
          {uris.length > 1 && (
            <View style={{ position: 'absolute', bottom: 48, flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {uris.map((_, i) => (
                <Pressable key={i} onPress={() => setCurrentIdx(i)}>
                  <View style={{
                    width: i === currentIdx ? 20 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: i === currentIdx ? '#fff' : 'rgba(255,255,255,0.35)',
                  }} />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </Modal>
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
