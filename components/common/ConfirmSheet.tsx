import React from 'react';
import { ActionSheet } from './ActionSheet';
import { ttx } from '../../lib/i18n/i18n';
import { useConfirmStore, type ConfirmOptions } from '../../lib/ui/confirm';

interface ConfirmSheetProps extends ConfirmOptions {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A yes/no question in the app's own sheet: one action with Cancel below it. The same look
 * in light and dark and the same words in Hindi as every other choice.
 */
export function ConfirmSheet({ visible, title, message, confirmLabel, destructive = false, onConfirm, onCancel }: ConfirmSheetProps) {
  return (
    <ActionSheet
      visible={visible}
      onClose={onCancel}
      title={ttx(title)}
      subtitle={message ? ttx(message) : undefined}
      subtitleLines={8}
      actions={[{ key: 'confirm', label: ttx(confirmLabel), destructive, onPress: onConfirm }]}
    />
  );
}

/** Mounted once in the root layout. Shows whatever `confirmAction` has asked. */
export function ConfirmHost() {
  const pending = useConfirmStore(s => s.pending);
  const settle = useConfirmStore(s => s.settle);
  if (!pending) return null;
  return (
    <ConfirmSheet
      visible
      {...pending.options}
      onConfirm={() => settle(true)}
      onCancel={() => settle(false)}
    />
  );
}
