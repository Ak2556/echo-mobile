import { Platform } from 'react-native';
import { useAppStore } from '../store/useAppStore';

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
  const isHot = mode === 'hot';
  const reduceMotion = options.reduceAnimations || options.dataSaver || isHot;
  const useBlur = Platform.OS === 'ios' && !options.dataSaver && !options.reduceAnimations && !isHot;
  const maxBlurIntensity =
    mode === 'overlay' ? 36 : mode === 'hero' ? 24 : isHot ? 0 : 48;

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
