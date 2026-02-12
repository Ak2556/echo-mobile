export const MOTION = {
  pressSoft: { damping: 24, stiffness: 520, mass: 0.7 },
  pressFirm: { damping: 22, stiffness: 620, mass: 0.72 },
  pressDeep: { damping: 20, stiffness: 720, mass: 0.75 },
  release: { damping: 18, stiffness: 420, mass: 0.85 },
  snap: { damping: 22, stiffness: 620, mass: 0.72 },
  settle: { damping: 24, stiffness: 360, mass: 0.9 },
  overshoot: { damping: 13, stiffness: 430, mass: 0.75 },
  entrance: { damping: 22, stiffness: 420, mass: 0.85 },
  cardEntrance: { damping: 24, stiffness: 460, mass: 0.9 },
  modalEntrance: { damping: 20, stiffness: 360, mass: 0.85 },
} as const;

export type PressDepth = 'soft' | 'medium' | 'deep';
type SpringPreset = { damping: number; stiffness: number; mass?: number };

export const PRESS_DEPTH: Record<PressDepth, { scale: number; translateY: number; opacity: number; spring: SpringPreset }> = {
  soft: { scale: 0.985, translateY: 0.5, opacity: 0.94, spring: MOTION.pressSoft },
  medium: { scale: 0.965, translateY: 1.5, opacity: 0.9, spring: MOTION.pressFirm },
  deep: { scale: 0.94, translateY: 2.5, opacity: 0.86, spring: MOTION.pressDeep },
};
