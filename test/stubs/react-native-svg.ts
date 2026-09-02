import * as React from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * react-native-svg stub for the `ui` vitest project.
 *
 * The commonjs build ships untranspiled .ts (SvgTouchableMixin), so Vite fails
 * on the first type annotation. Everything drawn with SVG — phosphor icons in
 * particular, which nearly every screen imports — pulls this in, so no screen
 * can be mounted without it.
 *
 * Each export renders a plain View. Nothing here has observable behaviour in
 * jsdom; the point is that a component tree containing icons mounts at all.
 */

const passthrough = (name: string) => {
  const C = React.forwardRef<unknown, ViewProps>((props, ref) =>
    React.createElement(View, { ...props, ref } as never, (props as ViewProps).children),
  );
  C.displayName = `${name}(Stub)`;
  return C;
};

export const Svg = passthrough('Svg');
export const Circle = passthrough('Circle');
export const Ellipse = passthrough('Ellipse');
export const G = passthrough('G');
export const Text = passthrough('Text');
export const TSpan = passthrough('TSpan');
export const TextPath = passthrough('TextPath');
export const Path = passthrough('Path');
export const Polygon = passthrough('Polygon');
export const Polyline = passthrough('Polyline');
export const Line = passthrough('Line');
export const Rect = passthrough('Rect');
export const Use = passthrough('Use');
export const Image = passthrough('Image');
export const Symbol = passthrough('Symbol');
export const Defs = passthrough('Defs');
export const LinearGradient = passthrough('LinearGradient');
export const RadialGradient = passthrough('RadialGradient');
export const Stop = passthrough('Stop');
export const ClipPath = passthrough('ClipPath');
export const Pattern = passthrough('Pattern');
export const Mask = passthrough('Mask');
export const Marker = passthrough('Marker');
export const ForeignObject = passthrough('ForeignObject');
export const SvgXml = passthrough('SvgXml');
export const SvgUri = passthrough('SvgUri');

export default Svg;
