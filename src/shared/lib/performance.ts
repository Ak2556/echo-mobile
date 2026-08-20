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
  options: { reduceAnimations: boolean; dataSaver: boolean; glassTheme: boolean }
): PerformanceProfile {
  // Max responsive mode: treat everything as 'hot'
  const isHot = !options.glassTheme;
  const reduceMotion = options.reduceAnimations || options.dataSaver || isHot;
  const useBlur = options.glassTheme;
  const maxBlurIntensity = options.glassTheme ? 100 : 0;

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
  const glassTheme = useAppStore(s => s.glassTheme);
  return resolvePerformanceProfile(mode, { reduceAnimations, dataSaver, glassTheme });
}
