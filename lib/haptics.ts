import * as Haptics from 'expo-haptics';

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

export function tap(kind: HapticKind = 'light') {
  switch (kind) {
    case 'light':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    case 'medium':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    case 'heavy':
      return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    case 'success':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    case 'warning':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    case 'error':
      return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    case 'selection':
      return Haptics.selectionAsync().catch(() => {});
  }
}
