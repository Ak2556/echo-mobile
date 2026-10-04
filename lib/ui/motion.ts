export const MOTION = {
  pressSoft: { damping: 18, stiffness: 800, mass: 0.4 },
  pressFirm: { damping: 18, stiffness: 900, mass: 0.4 },
  pressDeep: { damping: 18, stiffness: 1000, mass: 0.4 },
  release: { damping: 20, stiffness: 700, mass: 0.5 },
  snap: { damping: 20, stiffness: 800, mass: 0.5 },
  settle: { damping: 22, stiffness: 600, mass: 0.5 },
  overshoot: { damping: 16, stiffness: 500, mass: 0.6 },
  entrance: { damping: 20, stiffness: 600, mass: 0.5 },
  cardEntrance: { damping: 20, stiffness: 600, mass: 0.5 },
  modalEntrance: { damping: 20, stiffness: 500, mass: 0.5 },
} as const;

export type PressDepth = 'soft' | 'medium' | 'deep';
type SpringPreset = { damping: number; stiffness: number; mass?: number };

export const PRESS_DEPTH: Record<PressDepth, { scale: number; translateY: number; opacity: number; spring: SpringPreset }> = {
  soft: { scale: 0.985, translateY: 0.5, opacity: 0.94, spring: MOTION.pressSoft },
  medium: { scale: 0.965, translateY: 1.5, opacity: 0.9, spring: MOTION.pressFirm },
  deep: { scale: 0.94, translateY: 2.5, opacity: 0.86, spring: MOTION.pressDeep },
};
