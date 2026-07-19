import React, { Suspense } from 'react';
import { View, Text, Dimensions, ActivityIndicator, Pressable, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle, useSharedValue, withSpring, runOnJS, FadeIn, FadeInDown, SlideInDown, SlideOutDown,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Sparkle, ArrowsInSimple, GridFour } from 'phosphor-react-native';
import { useTheme } from '../../lib/theme';
import { useAuthStore } from '../../lib/auth/store';
import { useFloatingApp } from '../../store/floatingApp';
import { FLOATING_APPS, floatingAppMeta } from '../../lib/miniAppRegistry';
import { MiniAppEmbedContext } from '../../lib/miniAppEmbed';
import { MiniAppIcon, MiniAppGlyph } from './MiniAppIcon';
import { MINI_APP_CATALOG } from '../../lib/miniAppCatalog';
import { IconButton } from '../ui/IconButton';

// Per-app branding (colour + display name) from the shared catalog, so the
// floating picker reads exactly like the Tools tab. Falls back to the
// registry's own name + accent for anything not in the catalog.
const CATALOG_BY_ID = new Map<string, (typeof MINI_APP_CATALOG)[number]>(
  MINI_APP_CATALOG.map(a => [a.id, a]),
);

const BUBBLE = 54;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

export function FloatingMiniApp() {
  const mode = useFloatingApp(s => s.mode);
  const authed = useAuthStore(s => s.status === 'ready');
  // Only overlay the signed-in app — never the auth/onboarding flow.
  if (!authed || mode === 'closed') return null;
  // box-none: this full-screen layer ignores touches except on its children,
  // so the app underneath stays scrollable "alongside" the floating tool.
  // High zIndex/elevation keeps it above screen content (Toast sits at 9999).
  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9998, elevation: 24 }}
      pointerEvents="box-none"
    >
      {mode === 'bubble' ? <Bubble /> : <Panel />}
    </View>
  );
}

function Bubble() {
  const { colors } = useTheme();
  const { x, y, appId, openApp, openPicker, setPosition } = useFloatingApp();
  const meta = floatingAppMeta(appId);
  // Minimized bubble carries the active app's own colour (like its Tools tile).
  const brand = meta ? (CATALOG_BY_ID.get(meta.id)?.color ?? meta.color ?? colors.accent) : colors.accent;

  const startX = x >= 0 ? x : SCREEN_W - BUBBLE - 14;
  const startY = y >= 0 ? y : SCREEN_H * 0.62;
  const tx = useSharedValue(startX);
  const ty = useSharedValue(startY);
  const offX = useSharedValue(0);
  const offY = useSharedValue(0);

  const open = () => (meta ? openApp(meta.id) : openPicker());

  const pan = Gesture.Pan()
    .onStart(() => { offX.value = tx.value; offY.value = ty.value; })
    .onUpdate((e) => {
      tx.value = Math.max(6, Math.min(SCREEN_W - BUBBLE - 6, offX.value + e.translationX));
      ty.value = Math.max(60, Math.min(SCREEN_H - BUBBLE - 90, offY.value + e.translationY));
    })
    .onEnd(() => {
      // Snap to the nearest side edge.
      const snapX = tx.value + BUBBLE / 2 < SCREEN_W / 2 ? 6 : SCREEN_W - BUBBLE - 6;
      tx.value = withSpring(snapX, { damping: 18, stiffness: 200 });
      runOnJS(setPosition)(snapX, ty.value);
    });
  const tap = Gesture.Tap().maxDistance(8).onEnd(() => runOnJS(open)());
  const gesture = Gesture.Exclusive(pan, tap);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        entering={FadeIn.duration(180)}
        style={[{
          position: 'absolute', width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2,
          alignItems: 'center', justifyContent: 'center',
          backgroundColor: brand,
          shadowColor: brand, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8,
          borderWidth: 2, borderColor: colors.bg,
        }, style]}
        accessibilityRole="button"
        accessibilityLabel={meta ? `Open ${meta.name}` : 'Open mini-apps'}
      >
        {meta ? <MiniAppGlyph id={meta.id} color="#fff" size={24} /> : <Sparkle color="#fff" size={24} weight="fill" />}
      </Animated.View>
    </GestureDetector>
  );
}

function Panel() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { appId, openApp, openPicker, minimize } = useFloatingApp();
  const meta = floatingAppMeta(appId);
  const brand = meta ? (CATALOG_BY_ID.get(meta.id)?.color ?? meta.color ?? colors.accent) : colors.accent;

  // Bottom sheet ~72% of the screen; the top stays touchable (box-none parent).
  const panelHeight = Math.round(SCREEN_H * 0.72);

  const dragY = useSharedValue(0);
  const pan = Gesture.Pan()
    .onUpdate((e) => { dragY.value = Math.max(0, e.translationY); })
    .onEnd((e) => {
      if (e.translationY > 90) runOnJS(minimize)();
      dragY.value = withSpring(0, { damping: 20, stiffness: 220 });
    });
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }] }));

  return (
    <Animated.View
      entering={SlideInDown.duration(240)}
      exiting={SlideOutDown.duration(180)}
      style={[{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: panelHeight,
        backgroundColor: colors.bg,
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderWidth: 1, borderColor: colors.glassBorder, borderBottomWidth: 0,
        shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, shadowOffset: { width: 0, height: -6 }, elevation: 16,
        overflow: 'hidden',
      }, sheetStyle]}
    >
      {/* Ambient accent wash, matching the app's editorial cards. */}
      <LinearGradient
        colors={[`${brand}22`, `${brand}0A`, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 200 }}
        pointerEvents="none"
      />
      {/* Header — drag the grip to minimize; switch apps / close on the right. */}
      <GestureDetector gesture={pan}>
        <View style={{ paddingTop: 8, paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.glassBorder }}>
          <View style={{ alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: colors.textMuted, opacity: 0.5, marginBottom: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
            {meta
              ? <MiniAppIcon id={meta.id} color={brand} size={28} />
              : <Sparkle color={colors.accent} size={20} weight="fill" />}
            <Text style={{ flex: 1, color: colors.text, fontSize: 18, fontFamily: 'Fraunces_600SemiBold', letterSpacing: -0.3 }} numberOfLines={1}>
              {meta ? meta.name : 'Mini apps'}
            </Text>
            {meta ? (
              <IconButton icon={GridFour} label="Switch app" onPress={openPicker} size="sm" variant="surface" hitSize={34} color={colors.textSecondary} />
            ) : null}
            <IconButton icon={ArrowsInSimple} label="Minimize to bubble" onPress={minimize} size="sm" variant="surface" hitSize={34} color={colors.textSecondary} />
          </View>
        </View>
      </GestureDetector>

      {/* Body — the picker grid, or the embedded mini-app. */}
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        {meta ? (
          <MiniAppEmbedContext.Provider value={true}>
            <Suspense fallback={<View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.accent} /></View>}>
              <meta.Component />
            </Suspense>
          </MiniAppEmbedContext.Provider>
        ) : (
          <Picker onPick={openApp} />
        )}
      </View>
    </Animated.View>
  );
}

function Picker({ onPick }: { onPick: (id: string) => void }) {
  const { colors, font } = useTheme();
  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 }}>
      <Text style={[font.eyebrow, { color: colors.textMuted, marginBottom: 14, marginHorizontal: 4 }]}>
        Pick a tool to float
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {FLOATING_APPS.map((app, i) => {
          // Catalog supplies the tile colour; the registry supplies the tool's
          // actual name (avoids the catalog's marketing labels like "Write").
          const color = CATALOG_BY_ID.get(app.id)?.color ?? app.color ?? colors.accent;
          return (
            <Animated.View key={app.id} entering={FadeInDown.delay(Math.min(i, 12) * 24).duration(240)} style={{ width: '25%', marginBottom: 18 }}>
              <Pressable
                onPress={() => onPick(app.id)}
                accessibilityRole="button"
                accessibilityLabel={app.name}
                style={({ pressed }) => ({
                  width: '100%', alignItems: 'center', paddingHorizontal: 4,
                  opacity: pressed ? 0.6 : 1,
                  transform: [{ scale: pressed ? 0.94 : 1 }],
                })}
              >
                <MiniAppIcon id={app.id} color={color} size={54} />
                <Text
                  style={[font.bodySemibold, { color: colors.textSecondary, fontSize: 11, lineHeight: 14, marginTop: 8, textAlign: 'center', alignSelf: 'stretch' }]}
                  numberOfLines={1}
                >
                  {app.name}
                </Text>
              </Pressable>
            </Animated.View>
          );
        })}
      </View>
    </ScrollView>
  );
}
