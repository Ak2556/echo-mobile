import React, { useEffect } from 'react';
import { View, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { useTheme, SPACING, ANIM } from '../../lib/theme';

interface AuthFlowProgressProps {
  steps: string[];
  currentStep: number;
}

export function AuthFlowProgress({ steps, currentStep }: AuthFlowProgressProps) {
  const { colors, radius, reduceAnimations } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: SPACING.lg,
        paddingHorizontal: SPACING.xl,
      }}
    >
      {steps.map((step, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        const isFuture = i > currentStep;

        return (
          <React.Fragment key={step}>
            <View style={{ alignItems: 'center', gap: 4 }}>
              <AnimatedDot
                active={isActive}
                completed={isCompleted}
                colors={colors}
                radius={radius}
                reduceAnimations={reduceAnimations}
              />
              <Text
                style={{
                  fontSize: 10,
                  color: isActive
                    ? colors.accent
                    : isCompleted
                      ? colors.textSecondary
                      : colors.textMuted,
                  fontWeight: isActive ? '600' : '400',
                }}
              >
                {step}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View
                style={{
                  flex: 1,
                  height: 1.5,
                  marginBottom: SPACING.md + 2,
                  marginHorizontal: SPACING.xs,
                  backgroundColor: isCompleted ? colors.accent : colors.border,
                  opacity: isCompleted ? 0.5 : 1,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function AnimatedDot({
  active,
  completed,
  colors,
  radius,
  reduceAnimations,
}: {
  active: boolean;
  completed: boolean;
  colors: any;
  radius: any;
  reduceAnimations: boolean;
}) {
  const scale = useSharedValue(active ? 1 : 0.75);

  useEffect(() => {
    if (reduceAnimations) {
      scale.value = active ? 1 : 0.75;
    } else {
      scale.value = withSpring(active ? 1 : 0.75, ANIM.springSnappy);
    }
  }, [active, reduceAnimations]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const size = active ? 10 : 7;
  const bg = active
    ? colors.accent
    : completed
      ? colors.accent
      : colors.border;
  const opacity = completed && !active ? 0.4 : 1;

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius.full ?? 99,
          backgroundColor: bg,
          opacity,
        },
        animStyle,
      ]}
    />
  );
}
