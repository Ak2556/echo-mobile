import { Platform } from 'react-native';
import { useAppStore } from '../../../store/useAppStore';

export type PerformanceMode = 'default' | 'hot' | 'overlay' | 'hero';

export interface PerformanceProfile {
  reduceMotion: boolean;
  useBlur: boolean;
  pressAnimations: boolean;
  listAnimations: boolean;
  mountAnimations: boolean;
  maxBlurIntensity: number;
}

export function resolvePerformanceProfile(
  mode: PerformanceMode,
  options: { reduceAnimations: boolean; dataSaver: boolean }
): PerformanceProfile {
  // Max responsive mode: treat everything as 'hot'
  const isHot = true;
  const reduceMotion = options.reduceAnimations || options.dataSaver || isHot;
  const useBlur = false; // Never use heavy BlurViews when max responsive
  const maxBlurIntensity = 0;

  return {
    reduceMotion,
    useBlur,
    pressAnimations: !reduceMotion && !isHot,
    listAnimations: !reduceMotion && !isHot,
    mountAnimations: !reduceMotion && !isHot,
    maxBlurIntensity,
  };
}

export function usePerformanceProfile(mode: PerformanceMode = 'default'): PerformanceProfile {
  const reduceAnimations = useAppStore(s => s.reduceAnimations);
  const dataSaver = useAppStore(s => s.dataSaver);
  return resolvePerformanceProfile(mode, { reduceAnimations, dataSaver });
}
