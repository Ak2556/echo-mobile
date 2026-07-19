import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, ActivityIndicator, Image as RNImage } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { manipulateAsync, FlipType, SaveFormat } from 'expo-image-manipulator';
import {
  X, Check, ArrowClockwise, ArrowCounterClockwise, FlipHorizontal, FlipVertical, Crop,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';

interface PhotoEditorProps {
  visible: boolean;
  uri: string | null;
  onDone: (uri: string) => void;
  onCancel: () => void;
}

const ASPECTS: { key: string; label: string; ratio: number }[] = [
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'portrait', label: '4:5', ratio: 4 / 5 },
  { key: 'wide', label: '16:9', ratio: 16 / 9 },
  { key: 'classic', label: '3:2', ratio: 3 / 2 },
];

/**
 * Basic in-app photo editor: rotate, flip, and aspect-ratio crop, applied
 * eagerly via expo-image-manipulator (each op re-renders the preview). Requires
 * the native module, so it only functions on a build that includes it.
 */
export function PhotoEditor({ visible, uri, onDone, onCancel }: PhotoEditorProps) {
  const { colors } = useTheme();
  const [cur, setCur] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !uri) { setCur(null); setDirty(false); return; }
    setDirty(false);
    RNImage.getSize(
      uri,
      (w, h) => setCur({ uri, w, h }),
      () => setCur({ uri, w: 1, h: 1 }),
    );
  }, [visible, uri]);

  const run = async (actions: Parameters<typeof manipulateAsync>[1]) => {
    if (!cur || busy) return;
    setBusy(true);
    try {
      const r = await manipulateAsync(cur.uri, actions, { compress: 0.9, format: SaveFormat.JPEG });
      setCur({ uri: r.uri, w: r.width, h: r.height });
      setDirty(true);
    } catch {
      /* leave the current image untouched on failure */
    } finally {
      setBusy(false);
    }
  };

  const cropTo = (ratio: number) => {
    if (!cur) return;
    const a = cur.w / cur.h;
    let cw = cur.w, ch = cur.h, ox = 0, oy = 0;
    if (a > ratio) { cw = Math.round(cur.h * ratio); ox = Math.round((cur.w - cw) / 2); }
    else { ch = Math.round(cur.w / ratio); oy = Math.round((cur.h - ch) / 2); }
    void run([{ crop: { originX: ox, originY: oy, width: cw, height: ch } }]);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} transparent={false}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel edits">
            <X color="#fff" size={24} weight="bold" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Edit photo</Text>
          <Pressable
            onPress={() => cur && onDone(cur.uri)}
            hitSlop={10}
            disabled={!cur || busy}
            accessibilityRole="button"
            accessibilityLabel="Apply edits"
          >
            <Check color={dirty ? colors.accent : '#fff'} size={24} weight="bold" />
          </Pressable>
        </View>

        {/* Preview */}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}>
          {cur ? (
            <Image source={{ uri: cur.uri }} style={{ flex: 1, width: '100%' }} contentFit="contain" transition={120} />
          ) : (
            <ActivityIndicator color="#fff" />
          )}
          {busy && (
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        {/* Transform tools */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
          <Tool icon={<ArrowCounterClockwise color="#fff" size={22} weight="bold" />} label="Rotate" onPress={() => run([{ rotate: -90 }])} />
          <Tool icon={<ArrowClockwise color="#fff" size={22} weight="bold" />} label="Rotate" onPress={() => run([{ rotate: 90 }])} />
          <Tool icon={<FlipHorizontal color="#fff" size={22} weight="bold" />} label="Flip" onPress={() => run([{ flip: FlipType.Horizontal }])} />
          <Tool icon={<FlipVertical color="#fff" size={22} weight="bold" />} label="Flip" onPress={() => run([{ flip: FlipType.Vertical }])} />
        </View>

        {/* Aspect crop */}
        <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Crop color="rgba(255,255,255,0.6)" size={14} weight="bold" />
            <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>CROP</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {ASPECTS.map(a => (
              <Pressable
                key={a.key}
                onPress={() => cropTo(a.ratio)}
                accessibilityRole="button"
                accessibilityLabel={`Crop ${a.label}`}
                style={({ pressed }) => ({
                  flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12,
                  backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)',
                  borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
                })}
              >
                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{a.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Tool({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 4, minWidth: 56 }}>
      {icon}
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}
