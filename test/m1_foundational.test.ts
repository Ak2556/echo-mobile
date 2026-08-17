import { describe, it, expect, vi } from 'vitest';
import { SPACING, GLASS_INTENSITY, THEMES } from '../src/shared/lib/theme';
import { tap, haptic, triggerHaptic } from '../src/shared/lib/haptics';
import { Colors } from '../constants/Colors';
import { useAppStore } from '../store/useAppStore';

describe('Milestone M1 Foundational Tokens & System Empirical Tests', () => {
  describe('1. SPACING Tokens', () => {
    it('defines exact spacing values required by design spec', () => {
      expect(SPACING).toEqual({
        xs: 4,
        sm: 8,
        md: 12,
        lg: 16,
        xl: 20,
        xxl: 24,
        xxxl: 32,
      });
    });

    it('has all required 7 spacing keys with correct ascending pixel values', () => {
      expect(SPACING.xs).toBe(4);
      expect(SPACING.sm).toBe(8);
      expect(SPACING.md).toBe(12);
      expect(SPACING.lg).toBe(16);
      expect(SPACING.xl).toBe(20);
      expect(SPACING.xxl).toBe(24);
      expect(SPACING.xxxl).toBe(32);
    });
  });

  describe('2. GLASS_INTENSITY Blur Tokens', () => {
    it('defines exact glass blur intensity levels', () => {
      expect(GLASS_INTENSITY).toEqual({
        light: 18,
        medium: 30,
        heavy: 45,
        ultra: 70,
      });
    });

    it('has correct relative blur ordering (light < medium < heavy < ultra)', () => {
      expect(GLASS_INTENSITY.light).toBeLessThan(GLASS_INTENSITY.medium);
      expect(GLASS_INTENSITY.medium).toBeLessThan(GLASS_INTENSITY.heavy);
      expect(GLASS_INTENSITY.heavy).toBeLessThan(GLASS_INTENSITY.ultra);
    });
  });

  describe('3. Haptics Abstraction (tap)', () => {
    it('handles all 7 valid haptic kinds without throwing', async () => {
      const kinds = ['light', 'medium', 'heavy', 'success', 'warning', 'error', 'selection'] as const;
      for (const kind of kinds) {
        await expect(tap(kind)).resolves.toBeUndefined();
      }
    });

    it('handles undefined input gracefully without throwing', async () => {
      // @ts-ignore
      await expect(tap(undefined)).resolves.toBeUndefined();
      // @ts-ignore
      await expect(tap()).resolves.toBeUndefined();
    });

    it('handles invalid/unknown kind string gracefully without throwing', async () => {
      // @ts-ignore
      await expect(tap('unknown_kind')).resolves.toBeUndefined();
      // @ts-ignore
      await expect(tap(null)).resolves.toBeUndefined();
      // @ts-ignore
      await expect(tap(123)).resolves.toBeUndefined();
    });

    it('provides helper aliases haptic and triggerHaptic', () => {
      expect(haptic).toBe(tap);
      expect(triggerHaptic).toBe(tap);
    });
  });

  describe('4. Theme Store & Theme Configurations', () => {
    it('contains all 9 predefined theme configurations in THEMES', () => {
      const themeNames = Object.keys(THEMES);
      expect(themeNames).toContain('midnight');
      expect(themeNames).toContain('amoled');
      expect(themeNames).toContain('tokyonight');
      expect(themeNames).toContain('rosepine');
      expect(themeNames).toContain('nord');
      expect(themeNames).toContain('light');
      expect(themeNames).toContain('tokyonight_day');
      expect(themeNames).toContain('rosepine_dawn');
      expect(themeNames).toContain('nord_light');
    });

    it('validates inputBg and inputBorder properties exist on all themes', () => {
      for (const themeKey of Object.keys(THEMES)) {
        const theme = THEMES[themeKey as keyof typeof THEMES];
        expect(theme.inputBg).toBeDefined();
        expect(theme.inputBorder).toBeDefined();
        expect(theme.glassFill).toBeDefined();
        expect(theme.glassBorder).toBeDefined();
      }
    });

    it('app store contains theme state', () => {
      const state = useAppStore.getState();
      expect(state.theme).toBeDefined();
      expect(state.darkMode).toBeDefined();
    });
  });

  describe('5. Legacy Colors Deprecation & Re-export Compatibility', () => {
    it('re-exports midnight theme colors accurately for backwards compatibility', () => {
      expect(Colors.background).toBe(THEMES.midnight.bg);
      expect(Colors.surface).toBe(THEMES.midnight.surface);
      expect(Colors.primary).toBe(THEMES.midnight.accent);
      expect(Colors.text).toBe(THEMES.midnight.text);
      expect(Colors.textMuted).toBe(THEMES.midnight.textMuted);
      expect(Colors.border).toBe(THEMES.midnight.border);
    });
  });
});
