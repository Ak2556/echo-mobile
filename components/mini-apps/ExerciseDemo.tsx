import React, { useEffect } from 'react';
import Animated, {
  Easing, SharedValue, useAnimatedProps, useSharedValue,
  withRepeat, withSequence, withTiming, cancelAnimation,
} from 'react-native-reanimated';
import Svg, { Circle, Line } from 'react-native-svg';
import { Exercise } from '../../lib/exerciseLibrary';

const ALine = Animated.createAnimatedComponent(Line);
const ACircle = Animated.createAnimatedComponent(Circle);

type Pt = [number, number];

/** One limb segment, interpolating both endpoints between keyframe poses. */
function Seg({ t, a1, a2, b1, b2, stroke, opacity = 1 }: {
  t: SharedValue<number>; a1: Pt; a2: Pt; b1: Pt; b2: Pt; stroke: string; opacity?: number;
}) {
  const props = useAnimatedProps(() => ({
    x1: a1[0] + (b1[0] - a1[0]) * t.value,
    y1: a1[1] + (b1[1] - a1[1]) * t.value,
    x2: a2[0] + (b2[0] - a2[0]) * t.value,
    y2: a2[1] + (b2[1] - a2[1]) * t.value,
  }));
  return <ALine animatedProps={props} stroke={stroke} strokeWidth={5} strokeLinecap="round" opacity={opacity} />;
}

function Dot({ t, a, b, r, fill, opacity = 1 }: {
  t: SharedValue<number>; a: Pt; b: Pt; r: number; fill: string; opacity?: number;
}) {
  const props = useAnimatedProps(() => ({
    cx: a[0] + (b[0] - a[0]) * t.value,
    cy: a[1] + (b[1] - a[1]) * t.value,
  }));
  return <ACircle animatedProps={props} r={r} fill={fill} opacity={opacity} />;
}

/**
 * Looping side-view demonstration of an exercise: joints interpolate between
 * the two keyframe poses with a short hold at each end of the rep.
 */
export function ExerciseDemo({ exercise, color, muted, size = 150 }: {
  exercise: Exercise; color: string; muted: string; size?: number;
}) {
  const t = useSharedValue(0);

  useEffect(() => {
    const ease = Easing.inOut(Easing.quad);
    t.value = 0;
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: exercise.tempo, easing: ease }),
        withTiming(1, { duration: 180 }),
        withTiming(0, { duration: exercise.tempo, easing: ease }),
        withTiming(0, { duration: 180 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise.id]);

  const [a, b] = exercise.poses;
  const aKnee2 = a.knee2 ?? a.knee;
  const aAnkle2 = a.ankle2 ?? a.ankle;
  const bKnee2 = b.knee2 ?? b.knee;
  const bAnkle2 = b.ankle2 ?? b.ankle;
  const propR = exercise.prop === 'bar' ? 5.5 : exercise.prop === 'dumbbell' ? 3.5 : 0;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Line x1={8} y1={91.5} x2={92} y2={91.5} stroke={muted} strokeWidth={1.5} strokeLinecap="round" opacity={0.35} />
      {/* far leg */}
      <Seg t={t} a1={a.hip} a2={aKnee2} b1={b.hip} b2={bKnee2} stroke={color} opacity={0.38} />
      <Seg t={t} a1={aKnee2} a2={aAnkle2} b1={bKnee2} b2={bAnkle2} stroke={color} opacity={0.38} />
      {/* near leg */}
      <Seg t={t} a1={a.hip} a2={a.knee} b1={b.hip} b2={b.knee} stroke={color} />
      <Seg t={t} a1={a.knee} a2={a.ankle} b1={b.knee} b2={b.ankle} stroke={color} />
      {/* torso + arm */}
      <Seg t={t} a1={a.shoulder} a2={a.hip} b1={b.shoulder} b2={b.hip} stroke={color} />
      <Seg t={t} a1={a.shoulder} a2={a.elbow} b1={b.shoulder} b2={b.elbow} stroke={color} opacity={0.85} />
      <Seg t={t} a1={a.elbow} a2={a.hand} b1={b.elbow} b2={b.hand} stroke={color} opacity={0.85} />
      <Dot t={t} a={a.head} b={b.head} r={6.5} fill={color} />
      {propR > 0 && <Dot t={t} a={a.hand} b={b.hand} r={propR} fill={color} opacity={0.55} />}
    </Svg>
  );
}
