import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * expo-image stub for the `ui` vitest project.
 *
 * expo-image imports expo-modules-core at module load, which reaches for the
 * Expo native runtime and throws under jsdom ("Cannot read properties of
 * undefined (reading 'EventEmitter')"). Any component that renders an image —
 * which is most of them — is untestable without this.
 *
 * `source` is kept on the element so tests can assert which image was rendered.
 */
export interface ImageProps extends ViewProps {
  source?: unknown;
  contentFit?: string;
  transition?: number;
  placeholder?: unknown;
  cachePolicy?: string;
  recyclingKey?: string;
}

function sourceUri(source: unknown): string | undefined {
  if (typeof source === 'string') return source;
  if (source && typeof source === 'object' && 'uri' in source) {
    const uri = (source as { uri?: unknown }).uri;
    return typeof uri === 'string' ? uri : undefined;
  }
  return undefined;
}

export const Image = React.forwardRef<unknown, ImageProps>(
  ({ source, contentFit: _fit, transition: _t, placeholder: _p, cachePolicy: _c, recyclingKey: _r, children, ...rest }, ref) =>
    React.createElement(
      View,
      { ...rest, ref, 'data-image-source': sourceUri(source) } as never,
      children,
    ),
);
Image.displayName = 'Image(Stub)';

export const ImageBackground = Image;
export function useImage() { return null; }

export default { Image, ImageBackground, useImage };
