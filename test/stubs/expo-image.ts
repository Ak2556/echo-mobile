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
 * `source` is kept on the element so tests can assert which image was rendered,
 * and so are the loading props. Those are the ones that regress invisibly: a
 * missing `recyclingKey` shows the previous row's photo for a frame in a
 * recycled list, and a missing `transition` pops the image in against grey.
 * Neither is visible in a snapshot, so they have to be assertable directly.
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

function placeholderLabel(placeholder: unknown): string | undefined {
  if (placeholder == null) return undefined;
  if (typeof placeholder === 'string') return placeholder;
  if (typeof placeholder === 'object') {
    const p = placeholder as Record<string, unknown>;
    for (const key of ['blurhash', 'thumbhash', 'uri']) {
      if (typeof p[key] === 'string') return p[key] as string;
    }
  }
  return String(placeholder);
}

/**
 * react-native-web drops unknown props rather than forwarding them to the DOM,
 * so a bare `data-*` attribute never survives the render. `dataSet` is the
 * channel it does forward — {imageSource: 'x'} arrives as data-image-source="x".
 */
export const Image = React.forwardRef<unknown, ImageProps>(
  ({ source, contentFit, transition, placeholder, cachePolicy, recyclingKey, children, ...rest }, ref) =>
    React.createElement(
      View,
      {
        ...rest,
        ref,
        dataSet: {
          imageSource: sourceUri(source),
          contentFit,
          transition: transition == null ? undefined : String(transition),
          placeholder: placeholderLabel(placeholder),
          cachePolicy,
          recyclingKey,
        },
      } as never,
      children,
    ),
);
Image.displayName = 'Image(Stub)';

export const ImageBackground = Image;
export function useImage() { return null; }

export default { Image, ImageBackground, useImage };
