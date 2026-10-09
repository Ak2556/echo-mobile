import React from 'react';
import { Plus, X } from 'phosphor-react-native';
import { IconButton } from './IconButton';
import { ttx } from '../../lib/i18n/i18n';

interface HeaderAddButtonProps {
  onPress: () => void;
  /** What the button makes, e.g. "Add habit". Read aloud by screen readers. */
  label?: string;
  /** The thing it opens is showing; the glyph turns into a close mark. */
  open?: boolean;
}

/**
 * The one "add" control. It always sits at the top right of the screen header, so
 * a person learns once where to look and never has to hunt for a floating button
 * that can cover content or sit under the voice button.
 */
export function HeaderAddButton({ onPress, label, open }: HeaderAddButtonProps) {
  return (
    <IconButton
      icon={open ? X : Plus}
      label={label ?? ttx('Add')}
      onPress={onPress}
      variant="solid"
      role="active"
      size="md"
      hitSize={40}
      haptic="medium"
    />
  );
}
