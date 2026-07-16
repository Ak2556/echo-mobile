import React from 'react';
import { Modal, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CaretLeft, CaretRight, X } from 'phosphor-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

interface ZoomableImageViewerProps {
  visible: boolean;
  uris: string[];
  initialIndex?: number;
  title?: string;
  onClose: () => void;
}

export function ZoomableImageViewer({
  visible,
  uris,
  initialIndex = 0,
  title,
  onClose,
}: ZoomableImageViewerProps) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = React.useState(initialIndex);

  React.useEffect(() => {
    if (visible) setIndex(initialIndex);
  }, [initialIndex, visible]);

  if (!uris.length) return null;

  const currentUri = uris[Math.min(index, uris.length - 1)];
  const canPrev = index > 0;
  const canNext = index < uris.length - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.97)' }}>
        <View style={{
          position: 'absolute',
          top: insets.top + 10,
          left: 16,
          right: 16,
          zIndex: 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Pressable onPress={onClose} hitSlop={14} style={controlStyle}>
            <X color="#fff" size={20} weight="bold" />
          </Pressable>
          <View style={{ alignItems: 'center', flex: 1, paddingHorizontal: 12 }}>
            {title ? (
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }} numberOfLines={1}>{title}</Text>
            ) : null}
            {uris.length > 1 ? (
              <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', marginTop: title ? 2 : 0 }}>
                {index + 1} / {uris.length}
              </Text>
            ) : null}
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ZoomableImage uri={currentUri} resetKey={currentUri} />

        {uris.length > 1 ? (
          <>
            {canPrev ? (
              <Pressable
                onPress={() => setIndex(value => Math.max(0, value - 1))}
                hitSlop={12}
                style={[controlStyle, { position: 'absolute', left: 14, top: '50%', zIndex: 15 }]}
              >
                <CaretLeft color="#fff" size={22} weight="bold" />
              </Pressable>
            ) : null}
            {canNext ? (
              <Pressable
                onPress={() => setIndex(value => Math.min(uris.length - 1, value + 1))}
                hitSlop={12}
                style={[controlStyle, { position: 'absolute', right: 14, top: '50%', zIndex: 15 }]}
              >
                <CaretRight color="#fff" size={22} weight="bold" />
              </Pressable>
            ) : null}
            <View style={{ position: 'absolute', bottom: insets.bottom + 28, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
              {uris.map((_, dotIndex) => (
                <Pressable key={dotIndex} onPress={() => setIndex(dotIndex)} hitSlop={8}>
                  <View style={{
                    width: dotIndex === index ? 20 : 7,
                    height: 7,
                    borderRadius: 4,
                    backgroundColor: dotIndex === index ? '#fff' : 'rgba(255,255,255,0.35)',
                  }} />
                </Pressable>
              ))}
            </View>
          </>
        ) : null}
      </View>
    </Modal>
  );
}

function ZoomableImage({ uri, resetKey }: { uri: string; resetKey: string }) {
  const { width, height } = useWindowDimensions();
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  React.useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedX.value = 0;
    savedY.value = 0;
  }, [resetKey, savedScale, savedX, savedY, scale, translateX, translateY]);

  const reset = () => {
    'worklet';
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate(event => {
      const nextScale = Math.max(1, Math.min(savedScale.value * event.scale, 4));
      scale.value = nextScale;
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
      } else {
        savedScale.value = scale.value;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate(event => {
      if (scale.value <= 1) return;
      translateX.value = savedX.value + event.translationX;
      translateY.value = savedY.value + event.translationY;
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        reset();
        return;
      }
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.05) {
        reset();
        return;
      }
      scale.value = withTiming(2.4, { duration: 180 });
      savedScale.value = 2.4;
    });

  const gesture = Gesture.Simultaneous(pinch, pan, doubleTap);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ flex: 1, alignItems: 'center', justifyContent: 'center' }, animatedStyle]}>
        <Image
          source={{ uri }}
          style={{ width, height: height * 0.82 }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </Animated.View>
    </GestureDetector>
  );
}

const controlStyle = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: 'rgba(255,255,255,0.13)',
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
};
