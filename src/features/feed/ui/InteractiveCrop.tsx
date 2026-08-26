import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { ttx } from '../../../shared/lib/i18n';
import {
  containFit,
  type Rect,
  type ViewTransform,
} from '../../../../lib/cropGeometry';

/**
 * Interactive crop.
 *
 * Two ways to frame a shot, because people reach for both:
 *   · drag a corner to reshape the box, or drag its middle to move it
 *   · pinch or drag the photo behind the box to zoom and reposition it
 *
 * Nothing is applied until Apply is pressed, so the box is free to be dragged
 * around without committing anything — which is the difference between this and
 * the ratio buttons, where one tap crops immediately.
 *
 * The arithmetic that turns the box into a pixel rectangle lives in
 * lib/cropGeometry and is unit-tested; this file is only gestures and drawing.
 */

const HANDLE = 28;
const MIN_SIZE = 56;

interface Props {
  uri: string;
  /** Preview area, already laid out. */
  box: { width: number; height: number };
  /** True pixel dimensions of the image. */
  image: { width: number; height: number };
  onCancel: () => void;
  onApply: (rect: Rect, view: ViewTransform) => void;
}

export function InteractiveCrop({ uri, box, image, onCancel, onApply }: Props) {
  const fit = containFit(box, image);

  // The crop box, in preview coordinates. Starts as the whole picture.
  const x = useSharedValue(fit.x);
  const y = useSharedValue(fit.y);
  const w = useSharedValue(fit.width);
  const h = useSharedValue(fit.height);

  // The photo behind it.
  const zoom = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);

  // Where each gesture began, so a drag is relative rather than absolute.
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const startW = useSharedValue(0);
  const startH = useSharedValue(0);
  const startZoom = useSharedValue(1);
  const startTx = useSharedValue(0);
  const startTy = useSharedValue(0);

  /** Keep the box on screen. Bounds are the preview, since the photo may be panned. */
  const clamp = (nx: number, ny: number, nw: number, nh: number) => {
    'worklet';
    const width = Math.min(Math.max(nw, MIN_SIZE), box.width);
    const height = Math.min(Math.max(nh, MIN_SIZE), box.height);
    return {
      x: Math.min(Math.max(nx, 0), box.width - width),
      y: Math.min(Math.max(ny, 0), box.height - height),
      width,
      height,
    };
  };

  const moveBox = Gesture.Pan()
    .onStart(() => {
      startX.value = x.value;
      startY.value = y.value;
    })
    .onUpdate(e => {
      const next = clamp(startX.value + e.translationX, startY.value + e.translationY, w.value, h.value);
      x.value = next.x;
      y.value = next.y;
    });

  /** One corner. dx/dy say which edges this corner moves. */
  const cornerGesture = (dx: -1 | 1, dy: -1 | 1) =>
    Gesture.Pan()
      .onStart(() => {
        startX.value = x.value;
        startY.value = y.value;
        startW.value = w.value;
        startH.value = h.value;
      })
      .onUpdate(e => {
        // Dragging a left/top corner moves the origin as well as the size.
        const nw = startW.value + e.translationX * dx;
        const nh = startH.value + e.translationY * dy;
        const nx = dx === -1 ? startX.value + e.translationX : startX.value;
        const ny = dy === -1 ? startY.value + e.translationY : startY.value;
        const next = clamp(nx, ny, nw, nh);
        x.value = next.x;
        y.value = next.y;
        w.value = next.width;
        h.value = next.height;
      });

  const pinchPhoto = Gesture.Pinch()
    .onStart(() => { startZoom.value = zoom.value; })
    .onUpdate(e => {
      // Below 1 the photo would pull away from its own letterbox; above 8 it is
      // a handful of pixels filling the screen.
      zoom.value = Math.min(Math.max(startZoom.value * e.scale, 1), 8);
    });

  const panPhoto = Gesture.Pan()
    .minPointers(2)
    .onStart(() => {
      startTx.value = tx.value;
      startTy.value = ty.value;
    })
    .onUpdate(e => {
      tx.value = startTx.value + e.translationX;
      ty.value = startTy.value + e.translationY;
    });

  const photoGesture = Gesture.Simultaneous(pinchPhoto, panPhoto);

  const photoStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: zoom.value },
    ],
  }));

  const boxStyle = useAnimatedStyle(() => ({
    left: x.value,
    top: y.value,
    width: w.value,
    height: h.value,
  }));

  // The dimmed surround, drawn as four bands so the crop stays clear.
  const shadeTop = useAnimatedStyle(() => ({ left: 0, right: 0, top: 0, height: y.value }));
  const shadeBottom = useAnimatedStyle(() => ({ left: 0, right: 0, top: y.value + h.value, bottom: 0 }));
  const shadeLeft = useAnimatedStyle(() => ({ left: 0, top: y.value, width: x.value, height: h.value }));
  const shadeRight = useAnimatedStyle(() => ({ left: x.value + w.value, top: y.value, right: 0, height: h.value }));

  const apply = () => {
    onApply(
      { x: x.value, y: y.value, width: w.value, height: h.value },
      { zoom: zoom.value, translateX: tx.value, translateY: ty.value },
    );
  };

  const corners: { key: string; dx: -1 | 1; dy: -1 | 1; style: object }[] = [
    { key: 'tl', dx: -1, dy: -1, style: { left: -HANDLE / 2, top: -HANDLE / 2 } },
    { key: 'tr', dx: 1, dy: -1, style: { right: -HANDLE / 2, top: -HANDLE / 2 } },
    { key: 'bl', dx: -1, dy: 1, style: { left: -HANDLE / 2, bottom: -HANDLE / 2 } },
    { key: 'br', dx: 1, dy: 1, style: { right: -HANDLE / 2, bottom: -HANDLE / 2 } },
  ];

  return (
    // collapsable={false} throughout: these views are pure layout, and a
    // flattened view takes its gesture target with it.
    <View style={{ flex: 1 }} collapsable={false}>
      <GestureDetector gesture={photoGesture}>
        <Animated.View style={{ flex: 1 }} collapsable={false}>
          <Animated.View style={[{ flex: 1 }, photoStyle]} collapsable={false}>
            <Image source={{ uri }} style={{ flex: 1, width: '100%' }} contentFit="contain" />
          </Animated.View>

          <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' }, shadeTop]} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' }, shadeBottom]} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' }, shadeLeft]} />
          <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' }, shadeRight]} />

          <GestureDetector gesture={moveBox}>
            <Animated.View
              collapsable={false}
              style={[
                { position: 'absolute', borderWidth: 1.5, borderColor: '#fff' },
                boxStyle,
              ]}
            >
              {/* Rule of thirds, the usual framing aid. */}
              <View pointerEvents="none" style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />
              <View pointerEvents="none" style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.35)' }} />

              {corners.map(c => (
                <GestureDetector key={c.key} gesture={cornerGesture(c.dx, c.dy)}>
                  <Animated.View
                    collapsable={false}
                    style={[
                      {
                        position: 'absolute',
                        width: HANDLE,
                        height: HANDLE,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                      c.style,
                    ]}
                  >
                    <View style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: '#fff' }} />
                  </Animated.View>
                </GestureDetector>
              ))}
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </GestureDetector>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 16 }}>
        <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={10}>
          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15, fontWeight: '600' }}>{ttx('Cancel')}</Text>
        </Pressable>
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
          {ttx('Drag a corner, or pinch the photo')}
        </Text>
        <Pressable onPress={apply} accessibilityRole="button" hitSlop={10}>
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '800' }}>{ttx('Apply')}</Text>
        </Pressable>
      </View>
    </View>
  );
}
