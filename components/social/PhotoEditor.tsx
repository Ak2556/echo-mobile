/* eslint-disable @typescript-eslint/no-require-imports */
import React, {
  useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle,
} from 'react';
import {
  Modal, View, Text, Pressable, ActivityIndicator, Image as RNImage, ScrollView, LayoutChangeEvent, TextInput,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Image } from 'expo-image';
import {
  X, Check, ArrowClockwise, ArrowCounterClockwise, FlipHorizontal, FlipVertical, Crop,
  SlidersHorizontal, MagicWand, ArrowUUpLeft, Cube, Sun, SunDim, CircleHalf, Drop, Thermometer, DropHalf, Cloud,
  Palette, Coffee, CornersIn, ScribbleLoop, PaintBucket, Eraser, TextT
} from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { showToast } from '../ui/Toast';
import { Slider } from '../ui/Slider';
import {
  finalMatrix, hasAdjustments, FILTER_PRESETS, NO_ADJUST, IDENTITY, type Adjustments,
} from '../../lib/photoFilters';
import { ttx } from '../../lib/i18n';

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

type Mode = 'transform' | 'adjust' | 'filter' | 'draw' | 'text';

export type DrawPoint = { x: number; y: number };
export type DrawPath = { points: DrawPoint[]; color: string; strokeWidth: number };

const ASPECTS = [
  { key: 'square', label: '1:1', ratio: 1 },
  { key: 'portrait', label: '4:5', ratio: 4 / 5 },
  { key: 'landscape', label: '5:4', ratio: 5 / 4 },
  { key: 'story', label: '9:16', ratio: 9 / 16 },
  { key: 'wide', label: '16:9', ratio: 16 / 9 },
  { key: 'classic', label: '3:2', ratio: 3 / 2 },
];

export function PhotoEditor({ visible, uri, onDone, onCancel }: PhotoEditorProps) {
  const { colors } = useTheme();
  const [cur, setCur] = useState<{ uri: string; w: number; h: number } | null>(null);
  const [mode, setMode] = useState<Mode>('transform');
  const [adjust, setAdjust] = useState<Adjustments>(NO_ADJUST);
  const [preset, setPreset] = useState('none');
  const [activeAdjustTool, setActiveAdjustTool] = useState<keyof Adjustments>('exposure');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [showOriginal, setShowOriginal] = useState(false);
  const [drawPaths, setDrawPaths] = useState<DrawPath[]>([]);
  const [currentPath, setCurrentPath] = useState<DrawPoint[] | null>(null);
  const [activeDrawColor, setActiveDrawColor] = useState('#EF4444');
  const [activeStrokeWidth, setActiveStrokeWidth] = useState(0.015);
  const [overlayText, setOverlayText] = useState('');
  const [textPos, setTextPos] = useState({ x: 0.5, y: 0.5 });
  const [textColor, setTextColor] = useState('#FFFFFF');
  const skiaRef = useRef<{ bake: () => Promise<string | null> }>(null);

  const matrix = useMemo(() => finalMatrix(preset, adjust), [preset, adjust]);
  const displayMatrix = showOriginal ? IDENTITY : matrix;
  const colorDirty = preset !== 'none' || hasAdjustments(adjust) || drawPaths.length > 0 || overlayText.length > 0;

  useEffect(() => {
    if (!visible || !uri) { setCur(null); setMode('transform'); setAdjust(NO_ADJUST); setPreset('none'); setDrawPaths([]); setOverlayText(''); setDirty(false); return; }
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
  const resetColor = () => { setAdjust(NO_ADJUST); setPreset('none'); setDrawPaths([]); setOverlayText(''); };
  
  const resetTransform = () => {
    if (!uri) return;
    RNImage.getSize(uri, (w, h) => {
      setCur({ uri, w, h });
      setDirty(true);
    }, () => setCur({ uri, w: 1, h: 1 }));
  };

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
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16 }}>
          <Pressable onPress={onCancel} hitSlop={10} accessibilityRole="button" accessibilityLabel={ttx("Cancel edits")}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '400' }}>{ttx("Cancel")}</Text>
          </Pressable>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.5 }}>{ttx("EDIT")}</Text>
          <Pressable onPress={handleDone} hitSlop={10} disabled={!cur || busy} accessibilityRole="button" accessibilityLabel={ttx("Apply edits")}>
            <Text style={{ color: dirty ? colors.accent : '#fff', fontSize: 17, fontWeight: '600', opacity: (!cur || busy) ? 0.5 : 1 }}>{ttx("Done")}</Text>
          </Pressable>
        </View>

        {/* Preview */}
        <Pressable
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 }}
          onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
          onPressIn={() => setShowOriginal(true)}
          onPressOut={() => setShowOriginal(false)}
        >
          {!cur ? (
            <ActivityIndicator color="#fff" />
          ) : SKIA_OK && Sk ? (
            <SkiaColorPreview ref={skiaRef} uri={cur.uri} matrix={displayMatrix} vignette={adjust.vignette} boxW={box.w} boxH={box.h} skia={Sk} 
              drawPaths={drawPaths}
              currentPath={currentPath}
              activeDrawColor={activeDrawColor}
              activeStrokeWidth={activeStrokeWidth}
              isDrawingMode={mode === 'draw'}
              isTextMode={mode === 'text'}
              overlayText={overlayText}
              textPos={textPos}
              textColor={textColor}
              onTextDrag={pt => { setTextPos(pt); setDirty(true); }}
              onDrawStart={pt => setCurrentPath([pt])}
              onDrawMove={pt => setCurrentPath(p => [...(p || []), pt])}
              onDrawEnd={() => {
                if (currentPath && currentPath.length > 0) {
                  setDrawPaths(p => [...p, { points: currentPath, color: activeDrawColor, strokeWidth: activeStrokeWidth }]);
                  setDirty(true);
                }
                setCurrentPath(null);
              }}
            />
          ) : (
            <Image source={{ uri: cur.uri }} style={{ flex: 1, width: '100%' }} contentFit="contain" transition={120} />
          )}
          {busy && (
            <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <ActivityIndicator color="#fff" />
            </View>
          )}
        </Pressable>

        {/* Mode controls */}
        <View style={{ minHeight: 150, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 12 }}>
          {mode === 'transform' && (
            <>
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16, paddingBottom: 20 }}>
                <ToolBtn icon={<ArrowCounterClockwise color="#fff" size={20} weight="bold" />} onPress={() => runTransform(() => [{ rotate: -90 }])} />
                <ToolBtn icon={<ArrowClockwise color="#fff" size={20} weight="bold" />} onPress={() => runTransform(() => [{ rotate: 90 }])} />
                <ToolBtn icon={<FlipHorizontal color="#fff" size={20} weight="bold" />} onPress={() => runTransform(m => [{ flip: m.FlipType.Horizontal }])} />
                <ToolBtn icon={<FlipVertical color="#fff" size={20} weight="bold" />} onPress={() => runTransform(m => [{ flip: m.FlipType.Vertical }])} />
                <ToolBtn icon={<ArrowUUpLeft color="#fff" size={20} weight="bold" />} onPress={resetTransform} />
              </View>
              <View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 10, alignItems: 'center' }}>
                  <Crop color="rgba(255,255,255,0.6)" size={20} weight="bold" />
                  <View style={{ width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 4 }} />
                  {ASPECTS.map(a => (
                    <Pressable key={a.key} onPress={() => cropTo(a.ratio)} accessibilityRole="button" accessibilityLabel={`Crop ${a.label}`}
                      style={({ pressed }) => ({ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: pressed ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.08)' })}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: 0.5 }}>{a.label}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            </>
          )}

          {mode === 'adjust' && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
              {!SKIA_OK && (
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, marginBottom: 8, textAlign: 'center' }}>{ttx("Color edits apply once the app is rebuilt with the editor engine.")}</Text>
              )}
              
              <View style={{ height: 60, justifyContent: 'center' }}>
                <Slider 
                  label={ttx(activeAdjustTool.charAt(0).toUpperCase() + activeAdjustTool.slice(1))} 
                  value={adjust[activeAdjustTool]} 
                  onChange={v => patchAdjust(activeAdjustTool, v)} 
                  accent={colors.accent} 
                />
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 24, paddingTop: 20, paddingHorizontal: 12 }}>
                {[
                  { key: 'exposure', label: 'Exposure', icon: <Sun color={activeAdjustTool === 'exposure' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'exposure' ? 'fill' : 'regular'} /> },
                  { key: 'brightness', label: 'Brightness', icon: <SunDim color={activeAdjustTool === 'brightness' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'brightness' ? 'fill' : 'regular'} /> },
                  { key: 'contrast', label: 'Contrast', icon: <CircleHalf color={activeAdjustTool === 'contrast' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'contrast' ? 'fill' : 'regular'} /> },
                  { key: 'saturation', label: 'Saturation', icon: <Drop color={activeAdjustTool === 'saturation' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'saturation' ? 'fill' : 'regular'} /> },
                  { key: 'warmth', label: 'Warmth', icon: <Thermometer color={activeAdjustTool === 'warmth' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'warmth' ? 'fill' : 'regular'} /> },
                  { key: 'tint', label: 'Tint', icon: <DropHalf color={activeAdjustTool === 'tint' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'tint' ? 'fill' : 'regular'} /> },
                  { key: 'fade', label: 'Fade', icon: <Cloud color={activeAdjustTool === 'fade' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'fade' ? 'fill' : 'regular'} /> },
                  { key: 'hue', label: 'Hue', icon: <Palette color={activeAdjustTool === 'hue' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'hue' ? 'fill' : 'regular'} /> },
                  { key: 'sepia', label: 'Sepia', icon: <Coffee color={activeAdjustTool === 'sepia' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'sepia' ? 'fill' : 'regular'} /> },
                  { key: 'vignette', label: 'Vignette', icon: <CornersIn color={activeAdjustTool === 'vignette' ? '#fff' : 'rgba(255,255,255,0.7)'} size={24} weight={activeAdjustTool === 'vignette' ? 'fill' : 'regular'} /> },
                  { key: 'red', label: 'Red', icon: <Drop color={activeAdjustTool === 'red' ? '#EF4444' : 'rgba(239, 68, 68, 0.5)'} size={24} weight={activeAdjustTool === 'red' ? 'fill' : 'regular'} /> },
                  { key: 'green', label: 'Green', icon: <Drop color={activeAdjustTool === 'green' ? '#22C55E' : 'rgba(34, 197, 94, 0.5)'} size={24} weight={activeAdjustTool === 'green' ? 'fill' : 'regular'} /> },
                  { key: 'blue', label: 'Blue', icon: <Drop color={activeAdjustTool === 'blue' ? '#3B82F6' : 'rgba(59, 130, 246, 0.5)'} size={24} weight={activeAdjustTool === 'blue' ? 'fill' : 'regular'} /> },
                ].map(tool => (
                  <Pressable key={tool.key} onPress={() => setActiveAdjustTool(tool.key as keyof Adjustments)} style={{ alignItems: 'center', gap: 8 }}>
                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: activeAdjustTool === tool.key ? 'rgba(255,255,255,0.15)' : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {tool.icon}
                    </View>
                    <Text style={{ color: activeAdjustTool === tool.key ? '#fff' : 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600' }}>
                      {ttx(tool.label)}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          )}

          {mode === 'filter' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 10, paddingBottom: 8 }}>
              {FILTER_PRESETS.map(p => (
                <Pressable key={p.key} onPress={() => { setPreset(p.key); setDirty(true); }} accessibilityRole="button" accessibilityLabel={p.label}
                  style={{ alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 2, borderColor: preset === p.key ? colors.accent : 'transparent', overflow: 'hidden' }}>
                    {cur ? (
                      SKIA_OK && Sk ? (
                        <View pointerEvents="none" style={{ flex: 1 }}>
                          <SkiaColorPreview uri={cur.uri} matrix={p.matrix} vignette={adjust.vignette} boxW={64} boxH={64} skia={Sk} cover />
                        </View>
                      ) : (
                        <Image source={{ uri: cur.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      )
                    ) : null}
                  </View>
                  <Text style={{ color: preset === p.key ? colors.accent : 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600' }}>{p.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {mode === 'draw' && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
                <ToolBtn icon={<ArrowUUpLeft color={drawPaths.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)'} size={20} />} onPress={() => { setDrawPaths(p => p.slice(0, -1)); setDirty(true); }} />
                <ToolBtn icon={<Eraser color={drawPaths.length > 0 ? '#fff' : 'rgba(255,255,255,0.3)'} size={20} />} onPress={() => { setDrawPaths([]); setDirty(true); }} />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 12 }}>
                {['#FFFFFF', '#000000', '#EF4444', '#22C55E', '#3B82F6', '#F59E0B', '#A855F7', '#EC4899'].map(c => (
                  <Pressable key={c} onPress={() => setActiveDrawColor(c)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: 3, borderColor: activeDrawColor === c ? '#888' : 'transparent', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4 }} />
                ))}
              </ScrollView>
            </View>
          )}

          {mode === 'text' && (
            <View style={{ paddingHorizontal: 16, paddingBottom: 16, alignItems: 'center', width: '100%' }}>
              <TextInput
                value={overlayText}
                onChangeText={(t) => { setOverlayText(t); setDirty(true); }}
                placeholder="Type here..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  color: '#fff',
                  width: '100%',
                  padding: 12,
                  borderRadius: 8,
                  fontSize: 16,
                  marginBottom: 16,
                  textAlign: 'center',
                }}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16, paddingHorizontal: 12 }}>
                {['#FFFFFF', '#000000', '#EF4444', '#22C55E', '#3B82F6', '#F59E0B', '#A855F7', '#EC4899'].map(c => (
                  <Pressable key={c} onPress={() => setTextColor(c)} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: 3, borderColor: textColor === c ? '#888' : 'transparent', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 4 }} />
                ))}
              </ScrollView>
            </View>
          )}
        </View>

        {/* Mode tabs */}
        <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 16, gap: 24, flexWrap: 'wrap' }}>
          <ModeTab label={ttx("DRAW")} active={mode === 'draw'} onPress={() => setMode('draw')} accent={colors.accent} />
          <ModeTab label={ttx("TEXT")} active={mode === 'text'} onPress={() => setMode('text')} accent={colors.accent} />
          <ModeTab label={ttx("ADJUST")} active={mode === 'adjust'} onPress={() => setMode('adjust')} accent={colors.accent} />
          <ModeTab label={ttx("FILTERS")} active={mode === 'filter'} onPress={() => setMode('filter')} accent={colors.accent} />
          <ModeTab label={ttx("CROP")} active={mode === 'transform'} onPress={() => setMode('transform')} accent={colors.accent} />
          {colorDirty && (
            <ModeTab label={ttx("RESET")} active={false} onPress={resetColor} accent={colors.accent} />
          )}
        </View>
      </SafeAreaView>
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

function ToolBtn({ icon, onPress }: { icon: React.ReactNode; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}>
      {icon}
    </Pressable>
  );
}

function ModeTab({ label, active, onPress, accent }: { label: string; active: boolean; onPress: () => void; accent: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', paddingVertical: 8 }}>
      <Text style={{ color: active ? accent : 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: active ? '700' : '600', letterSpacing: 0.5 }}>{label}</Text>
      {active && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: accent, marginTop: 4 }} />}
    </Pressable>
  );
}

// ── Skia live preview + full-res bake (only mounted when Skia is available) ──
interface SkiaPreviewProps {
  uri: string;
  matrix: number[];
  vignette?: number;
  boxW: number;
  boxH: number;
  skia: any;
  cover?: boolean;
  drawPaths?: DrawPath[];
  currentPath?: DrawPoint[] | null;
  activeDrawColor?: string;
  activeStrokeWidth?: number;
  isDrawingMode?: boolean;
  isTextMode?: boolean;
  overlayText?: string;
  textPos?: { x: number; y: number };
  textColor?: string;
  onTextDrag?: (pt: { x: number; y: number }) => void;
  onDrawStart?: (pt: DrawPoint) => void;
  onDrawMove?: (pt: DrawPoint) => void;
  onDrawEnd?: () => void;
}
function buildSvgPath(pts: DrawPoint[], w: number, h: number) {
  if (!pts || pts.length === 0) return '';
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x * w} ${p.y * h}`).join(' ');
}
const SkiaColorPreview = forwardRef<{ bake: () => Promise<string | null> }, SkiaPreviewProps>(
  function SkiaColorPreview({ uri, matrix, vignette, boxW, boxH, skia, cover, drawPaths, currentPath, activeDrawColor, activeStrokeWidth, isDrawingMode, isTextMode, overlayText, textPos, textColor, onTextDrag, onDrawStart, onDrawMove, onDrawEnd }, ref) {
    const { useImage, Canvas, Image: SkImageComp, ColorMatrix, drawAsImage, ImageFormat, RadialGradient, vec, Rect, Group, Path, Text: SkText, useFont } = skia;
    const img = useImage(uri);
    
    // We require the font statically for Metro, then use it in Skia
    const fontPreview = useFont(require('../../node_modules/@expo-google-fonts/inter/900Black/Inter_900Black.ttf'), 48);

    useImperativeHandle(ref, () => ({
      async bake() {
        if (!img) return null;
        const w = img.width(), h = img.height();
        const rendered = await drawAsImage(
          <Group>
            <SkImageComp image={img} x={0} y={0} width={w} height={h} fit="cover">
              <ColorMatrix matrix={matrix} />
            </SkImageComp>
            {!!vignette && vignette > 0 && (
              <Rect x={0} y={0} width={w} height={h} blendMode="multiply">
                <RadialGradient c={vec(w / 2, h / 2)} r={Math.max(w, h) * (1 - vignette * 0.4)} colors={['transparent', 'rgba(0,0,0,0.8)']} />
              </Rect>
            )}
            {drawPaths?.map((p, i) => (
               <Path key={i} path={buildSvgPath(p.points, w, h)} color={p.color} style="stroke" strokeWidth={p.strokeWidth * Math.min(w, h)} strokeCap="round" strokeJoin="round" />
            ))}
            {!!overlayText && fontPreview && textPos && textColor && (
              <Group transform={[{ translateX: textPos.x * w }, { translateY: textPos.y * h }, { scale: w / boxW }]}>
                <SkText x={-fontPreview.getTextWidth(overlayText) / 2} y={fontPreview.getSize() / 2} text={overlayText} font={fontPreview} color={textColor} />
              </Group>
            )}
          </Group>,
          { width: w, height: h },
        );
        const b64 = rendered.encodeToBase64(ImageFormat.JPEG, 90);
        const FS = getFileSystem();
        if (!FS?.cacheDirectory) return null;
        const out = `${FS.cacheDirectory}echo-edit-${Date.now()}.jpg`;
        await FS.writeAsStringAsync(out, b64, { encoding: FS.EncodingType.Base64 });
        return out;
      },
    }), [img, matrix, vignette, drawAsImage, SkImageComp, ColorMatrix, ImageFormat, Group, Rect, RadialGradient, vec]);

    if (!img || boxW < 1 || boxH < 1) return <ActivityIndicator color="#fff" />;
    
    let dw = boxW, dh = boxH;
    if (!cover) {
      const ar = img.width() / img.height();
      dh = boxW / ar;
      if (dh > boxH) { dh = boxH; dw = boxH * ar; }
    }

    return (
      <View
        style={{ width: dw, height: dh }}
        onStartShouldSetResponder={() => !!isDrawingMode || !!isTextMode}
        onResponderGrant={(e) => {
          if (isDrawingMode) onDrawStart?.({ x: e.nativeEvent.locationX / dw, y: e.nativeEvent.locationY / dh });
          if (isTextMode) onTextDrag?.({ x: e.nativeEvent.locationX / dw, y: e.nativeEvent.locationY / dh });
        }}
        onResponderMove={(e) => {
          if (isDrawingMode) onDrawMove?.({ x: e.nativeEvent.locationX / dw, y: e.nativeEvent.locationY / dh });
          if (isTextMode) onTextDrag?.({ x: e.nativeEvent.locationX / dw, y: e.nativeEvent.locationY / dh });
        }}
        onResponderRelease={() => isDrawingMode && onDrawEnd?.()}
      >
        <Canvas style={{ flex: 1 }} pointerEvents="none">
          <SkImageComp image={img} x={0} y={0} width={dw} height={dh} fit={cover ? "cover" : "contain"}>
            <ColorMatrix matrix={matrix} />
          </SkImageComp>
          {!!vignette && vignette > 0 && (
            <Rect x={0} y={0} width={dw} height={dh} blendMode="multiply">
              <RadialGradient c={vec(dw / 2, dh / 2)} r={Math.max(dw, dh) * (1 - vignette * 0.4)} colors={['transparent', 'rgba(0,0,0,0.8)']} />
            </Rect>
          )}
          {drawPaths?.map((p, i) => (
             <Path key={i} path={buildSvgPath(p.points, dw, dh)} color={p.color} style="stroke" strokeWidth={p.strokeWidth * Math.min(dw, dh)} strokeCap="round" strokeJoin="round" />
          ))}
          {currentPath && currentPath.length > 0 && activeDrawColor && activeStrokeWidth && (
             <Path path={buildSvgPath(currentPath, dw, dh)} color={activeDrawColor} style="stroke" strokeWidth={activeStrokeWidth * Math.min(dw, dh)} strokeCap="round" strokeJoin="round" />
          )}
          {!!overlayText && fontPreview && textPos && textColor && (
            <Group transform={[{ translateX: textPos.x * dw }, { translateY: textPos.y * dh }]}>
              <SkText x={-fontPreview.getTextWidth(overlayText) / 2} y={fontPreview.getSize() / 2} text={overlayText} font={fontPreview} color={textColor} />
            </Group>
          )}
        </Canvas>
      </View>
    );
  },
);
