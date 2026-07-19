/* eslint-disable @typescript-eslint/no-require-imports */
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from 'react';
import {
  Modal, View, Text, Pressable, ActivityIndicator, Image as RNImage, ScrollView, LayoutChangeEvent,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import {
  X, Check, ArrowClockwise, ArrowCounterClockwise, FlipHorizontal, FlipVertical, Crop,
  SlidersHorizontal, MagicWand, ArrowUUpLeft, Cube,
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { showToast } from '../ui/Toast';
import { Slider } from '../ui/Slider';
import {
  finalMatrix, hasAdjustments, FILTER_PRESETS, NO_ADJUST, type Adjustments,
} from '../../lib/photoFilters';

type OptionalManipulator = {
  manipulateAsync: (uri: string, actions: unknown[], options: { compress?: number; format?: unknown }) => Promise<{ uri: string; width: number; height: number }>;
  SaveFormat: { JPEG: unknown };
  FlipType: { Horizontal: unknown; Vertical: unknown };
};

type OptionalFileSystem = {
  cacheDirectory?: string | null;
  EncodingType: { Base64: string };
  writeAsStringAsync: (fileUri: string, contents: string, options: { encoding: string }) => Promise<void>;
};

// ── Lazy natives (OTA-safe: never touched at module load on builds lacking them) ──
function getManipulator(): OptionalManipulator | null {
  try { return require('expo-image-manipulator') as OptionalManipulator; } catch { return null; }
}
let Sk: any = null;
try { Sk = require('@shopify/react-native-skia'); } catch { Sk = null; }
const SKIA_OK = !!Sk;
function getFileSystem(): OptionalFileSystem | null {
  try { return require('expo-file-system/legacy') as OptionalFileSystem; } catch { return null; }
}

interface PhotoEditorProps {
  visible: boolean;
  uri: string | null;
  onDone: (uri: string) => void;
  onCancel: () => void;
}

type Mode = 'transform' | 'adjust' | 'filter';

const ASPECTS = [
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'portrait', label: '4:5', ratio: 4 / 5 },
  { key: 'wide', label: '16:9', ratio: 16 / 9 },
  { key: 'classic', label: '3:2', ratio: 3 / 2 },
];

export function PhotoEditor({ visible, uri, onDone, onCancel }: PhotoEditorProps) {
  const { colors } = useTheme();
  const [cur, setCur] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>('transform');
  const [adjust, setAdjust] = useState<Adjustments>(NO_ADJUST);
  const [preset, setPreset] = useState('none');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const skiaRef = useRef<{ bake: () => Promise<string | null> }>(null);

  const matrix = useMemo(() => finalMatrix(preset, adjust), [preset, adjust]);
  const colorDirty = preset !== 'none' || hasAdjustments(adjust);

  useEffect(() => {
    if (!visible || !uri) { setCur(null); setMode('transform'); setAdjust(NO_ADJUST); setPreset('none'); setDirty(false); return; }
    RNImage.getSize(uri, (w, h) => setCur({ uri, w, h }), () => setCur({ uri, w: 1, h: 1 }));
  }, [visible, uri]);

  // Geometry ops bake into the file eagerly via expo-image-manipulator.
  const runTransform = async (build: (m: NonNullable<ReturnType<typeof getManipulator>>) => unknown[]) => {
    if (!cur || busy) return;
    const m = getManipulator();
    if (!m) { showToast('Editing needs the latest app version', 'Update needed'); return; }
    setBusy(true);
    try {
      const r = await m.manipulateAsync(cur.uri, build(m) as never, { compress: 0.9, format: m.SaveFormat.JPEG });
      setCur({ uri: r.uri, w: r.width, h: r.height });
      setDirty(true);
    } catch { /* keep current on failure */ } finally { setBusy(false); }
  };

  const cropTo = (ratio: number) => {
    if (!cur) return;
    const a = cur.w / cur.h;
    let cw = cur.w, ch = cur.h, ox = 0, oy = 0;
    if (a > ratio) { cw = Math.round(cur.h * ratio); ox = Math.round((cur.w - cw) / 2); }
    else { ch = Math.round(cur.w / ratio); oy = Math.round((cur.h - ch) / 2); }
    void runTransform(() => [{ crop: { originX: ox, originY: oy, width: cw, height: ch } }]);
  };

  const patchAdjust = (k: keyof Adjustments, v: number) => { setAdjust(a => ({ ...a, [k]: v })); setDirty(true); };
  const resetColor = () => { setAdjust(NO_ADJUST); setPreset('none'); };

  const handleDone = async () => {
    if (!cur) return;
    // Bake color via Skia if any was applied and Skia is available.
    if (colorDirty && SKIA_OK && skiaRef.current) {
      setBusy(true);
      try {
        const baked = await skiaRef.current.bake();
        onDone(baked ?? cur.uri);
        return;
      } catch { /* fall through */ } finally { setBusy(false); }
    }
    if (colorDirty && !SKIA_OK) showToast('Color edits need the latest app build', 'Applied crop only');
    onDone(cur.uri);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      {/* RN Modals are a separate window, so the app's safe-area context doesn't
          reach them — nest a provider so the header clears the status bar. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 }}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel edits">
            <X color="#fff" size={24} weight="bold" />
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Edit photo</Text>
          <Pressable onPress={handleDone} hitSlop={10} disabled={!cur || busy} accessibilityRole="button" accessibilityLabel="Apply edits">
            <Check color={dirty ? colors.accent : '#fff'} size={24} weight="bold" />
          </Pressable>
        </View>

        {/* Preview */}
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
          onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
        >
          {!cur ? (
            <ActivityIndicator color="#fff" />
          ) : SKIA_OK && Sk ? (
            <SkiaColorPreview ref={skiaRef} uri={cur.uri} matrix={matrix} boxW={box.w} boxH={box.h} skia={Sk} />
          ) : (
            <Image source={{ uri: cur.uri }} style={{ flex: 1, width: '100%' }} contentFit="contain" transition={120} />
          )}
          {busy && (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </View>

        {/* Mode controls */}
        <View style={{ minHeight: 150, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 }}>
          {mode === 'transform' && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 12 }}>
                <ToolBtn icon={<ArrowCounterClockwise color="#fff" size={22} weight="bold" />} label="Rotate" onPress={() => runTransform(() => [{ rotate: -90 }])} />
                <ToolBtn icon={<ArrowClockwise color="#fff" size={22} weight="bold" />} label="Rotate" onPress={() => runTransform(() => [{ rotate: 90 }])} />
                <ToolBtn icon={<FlipHorizontal color="#fff" size={22} weight="bold" />} label="Flip" onPress={() => runTransform(m => [{ flip: m.FlipType.Horizontal }])} />
                <ToolBtn icon={<FlipVertical color="#fff" size={22} weight="bold" />} label="Flip" onPress={() => runTransform(m => [{ flip: m.FlipType.Vertical }])} />
              </View>
              <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 2 }}>
                  <Crop color="rgba(255,255,255,0.6)" size={14} weight="bold" />
                </View>
                {ASPECTS.map(a => (
                  <Pressable key={a.key} onPress={() => cropTo(a.ratio)} accessibilityRole="button" accessibilityLabel={`Crop ${a.label}`}
                    style={({ pressed }) => ({ flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, backgroundColor: pressed ? 'rgba(255,255,255,0.16)' : 'rgba(255,255,255,0.08)' })}>
                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{a.label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {mode === 'adjust' && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
              {!SKIA_OK && (
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8 }}>Color edits apply once the app is rebuilt with the editor engine.</Text>
              )}
              <Slider label="Exposure" value={adjust.exposure} onChange={v => patchAdjust('exposure', v)} accent={colors.accent} />
              <Slider label="Brightness" value={adjust.brightness} onChange={v => patchAdjust('brightness', v)} accent={colors.accent} />
              <Slider label="Contrast" value={adjust.contrast} onChange={v => patchAdjust('contrast', v)} accent={colors.accent} />
              <Slider label="Saturation" value={adjust.saturation} onChange={v => patchAdjust('saturation', v)} accent={colors.accent} />
              <Slider label="Warmth" value={adjust.warmth} onChange={v => patchAdjust('warmth', v)} accent={colors.accent} />
            </View>
          )}

          {mode === 'filter' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: 8 }}>
              {FILTER_PRESETS.map(p => (
                <Pressable key={p.key} onPress={() => { setPreset(p.key); setDirty(true); }} accessibilityRole="button" accessibilityLabel={p.label}
                  style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: preset === p.key ? colors.accent : 'transparent', overflow: 'hidden' }}>
                    {cur ? <Image source={{ uri: cur.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" /> : null}
                  </View>
                  <Text style={{ color: preset === p.key ? colors.accent : 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Mode tabs */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
          <ModeTab icon={<Cube color={mode === 'transform' ? colors.accent : '#fff'} size={20} weight={mode === 'transform' ? 'fill' : 'bold'} />} label="Transform" active={mode === 'transform'} onPress={() => setMode('transform')} accent={colors.accent} />
          <ModeTab icon={<SlidersHorizontal color={mode === 'adjust' ? colors.accent : '#fff'} size={20} weight={mode === 'adjust' ? 'fill' : 'bold'} />} label="Adjust" active={mode === 'adjust'} onPress={() => setMode('adjust')} accent={colors.accent} />
          <ModeTab icon={<MagicWand color={mode === 'filter' ? colors.accent : '#fff'} size={20} weight={mode === 'filter' ? 'fill' : 'bold'} />} label="Filters" active={mode === 'filter'} onPress={() => setMode('filter')} accent={colors.accent} />
          {colorDirty && (
            <ModeTab icon={<ArrowUUpLeft color="#fff" size={20} weight="bold" />} label="Reset" active={false} onPress={resetColor} accent={colors.accent} />
          )}
        </View>
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

function ToolBtn({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 4, minWidth: 56 }}>
      {icon}
      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>{label}</Text>
    </Pressable>
  );
}

function ModeTab({ icon, label, active, onPress, accent }: { icon: React.ReactNode; label: string; active: boolean; onPress: () => void; accent: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 4, minWidth: 64 }}>
      {icon}
      <Text style={{ color: active ? accent : 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: active ? '700' : '500' }}>{label}</Text>
    </Pressable>
  );
}

// ── Skia live preview + full-res bake (only mounted when Skia is available) ──
interface SkiaPreviewProps {
  uri: string;
  matrix: number[];
  boxW: number;
  boxH: number;
  skia: any;
}
const SkiaColorPreview = forwardRef<{ bake: () => Promise<string | null> }, SkiaPreviewProps>(
  function SkiaColorPreview({ uri, matrix, boxW, boxH, skia }, ref) {
    const { useImage, Canvas, Image: SkImageComp, ColorMatrix, drawAsImage, ImageFormat } = skia;
    const img = useImage(uri);

    useImperativeHandle(ref, () => ({
      async bake() {
        if (!img) return null;
        const w = img.width(), h = img.height();
        const rendered = await drawAsImage(
          <SkImageComp image={img} x={0} y={0} width={w} height={h} fit="cover">
            <ColorMatrix matrix={matrix} />
          </SkImageComp>,
          { width: w, height: h },
        );
        const b64 = rendered.encodeToBase64(ImageFormat.JPEG, 90);
        const FS = getFileSystem();
        if (!FS?.cacheDirectory) return null;
        const out = `${FS.cacheDirectory}echo-edit-${Date.now()}.jpg`;
        await FS.writeAsStringAsync(out, b64, { encoding: FS.EncodingType.Base64 });
        return out;
      },
    }), [img, matrix, drawAsImage, SkImageComp, ColorMatrix, ImageFormat]);

    if (!img || boxW < 1 || boxH < 1) return <ActivityIndicator color="#fff" />;
    const ar = img.width() / img.height();
    let dw = boxW, dh = boxW / ar;
    if (dh > boxH) { dh = boxH; dw = boxH * ar; }

    return (
      <Canvas style={{ width: dw, height: dh }}>
        <SkImageComp image={img} x={0} y={0} width={dw} height={dh} fit="contain">
          <ColorMatrix matrix={matrix} />
        </SkImageComp>
      </Canvas>
    );
  },
);
