import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AnimatedPressable } from '../ui/AnimatedPressable';
import { useTutorialStore } from '../../store/tutorialStore';
import { useAppStore } from '../../store/useAppStore';
import { TOURS } from '../../lib/tutorialSteps';
import { useTheme } from '../../lib/theme';

const DIM = 'rgba(0,0,0,0.72)';

/**
 * Interactive coach-mark overlay. Dims the screen except a spotlight cut-out
 * around the current step's target, shows a tooltip, and advances on tap (the
 * whole backdrop, including the highlighted element, is tappable) or via the
 * tooltip button. Skippable; marks `hasSeenHomeTutorial` when finished.
 *
 * Mounted once at the app root so it can overlay any screen.
 */
export function TutorialOverlay() {
  const { colors, font } = useTheme();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const activeTour = useTutorialStore((s) => s.activeTour);
  const stepIndex = useTutorialStore((s) => s.stepIndex);
  const targets = useTutorialStore((s) => s.targets);
  const nextStep = useTutorialStore((s) => s.nextStep);
  const endTour = useTutorialStore((s) => s.endTour);
  const setHasSeenHomeTutorial = useAppStore((s) => s.setHasSeenHomeTutorial);

  const steps = activeTour ? TOURS[activeTour] ?? [] : [];
  const overflow = !!activeTour && stepIndex >= steps.length;

  const complete = React.useCallback(() => {
    endTour();
    setHasSeenHomeTutorial(true);
  }, [endTour, setHasSeenHomeTutorial]);

  // Past the last step → finish.
  useEffect(() => {
    if (overflow) complete();
  }, [overflow, complete]);

  if (!activeTour || overflow) return null;
  const step = steps[stepIndex];
  if (!step) return null;

  const isLast = stepIndex >= steps.length - 1;
  const advance = () => { if (isLast) complete(); else nextStep(); };

  const rect = step.targetId ? targets[step.targetId] : undefined;

  // Spotlight hole (padded) — clamped to screen.
  const pad = 8;
  const hole = rect
    ? {
        x: Math.max(0, rect.x - pad),
        y: Math.max(0, rect.y - pad),
        w: rect.width + pad * 2,
        h: rect.height + pad * 2,
      }
    : null;

  // Tooltip placement: below the target if there's room, else above; centered
  // when there's no target (intro/outro).
  const TOOLTIP_EST = 168;
  let tooltipTop: number;
  if (!hole) {
    tooltipTop = Math.max(insets.top + 40, screenH / 2 - TOOLTIP_EST / 2);
  } else if (screenH - (hole.y + hole.h) > TOOLTIP_EST + 24) {
    tooltipTop = hole.y + hole.h + 14;
  } else {
    tooltipTop = Math.max(insets.top + 12, hole.y - TOOLTIP_EST - 14);
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop — dim bands leave the target bright; tapping anywhere advances. */}
      <Pressable style={StyleSheet.absoluteFill} onPress={advance}>
        {hole ? (
          <>
            <View style={{ position: 'absolute', left: 0, top: 0, right: 0, height: hole.y, backgroundColor: DIM }} />
            <View style={{ position: 'absolute', left: 0, top: hole.y + hole.h, right: 0, bottom: 0, backgroundColor: DIM }} />
            <View style={{ position: 'absolute', left: 0, top: hole.y, width: hole.x, height: hole.h, backgroundColor: DIM }} />
            <View style={{ position: 'absolute', left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h, backgroundColor: DIM }} />
            {/* Highlight ring */}
            <View style={{
              position: 'absolute',
              left: hole.x, top: hole.y, width: hole.w, height: hole.h,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: colors.accent,
            }} />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
        )}
      </Pressable>

      {/* Tooltip */}
      <Animated.View
        key={stepIndex}
        entering={FadeIn.duration(220)}
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, top: tooltipTop, paddingHorizontal: 20 }}
      >
        <View style={{
          alignSelf: 'center',
          width: '100%',
          maxWidth: 420,
          backgroundColor: colors.bg,
          borderRadius: 18,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          padding: 18,
          shadowColor: '#000',
          shadowOpacity: 0.3,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 8 },
          elevation: 12,
        }}>
          <Text style={[font.display, { color: colors.text, fontSize: 19, lineHeight: 24, marginBottom: 6 }]}>
            {step.title}
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 14.5, lineHeight: 21 }}>
            {step.body}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <Pressable onPress={complete} hitSlop={8} accessibilityRole="button" accessibilityLabel="Skip tour">
              <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '600' }}>Skip</Text>
            </Pressable>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              {steps.map((_, i) => (
                <View key={i} style={{
                  width: i === stepIndex ? 18 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: i === stepIndex ? colors.accent : colors.border,
                }} />
              ))}
            </View>

            <AnimatedPressable
              onPress={advance}
              haptic="light"
              style={{ backgroundColor: colors.accent, borderRadius: 99, paddingHorizontal: 18, paddingVertical: 9 }}
              scaleValue={0.95}
            >
              <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>
                {step.cta ?? (isLast ? 'Done' : 'Next')}
              </Text>
            </AnimatedPressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
