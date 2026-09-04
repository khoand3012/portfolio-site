import type { ReactNode } from 'react';
import type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
} from '../types';

// Takes the layout fields plus arbitrary children rather than a whole
// ContainerBlock, so the same component serves both render paths: the public
// page passes children through BlockRenderer, and puck.config.tsx passes
// Puck's slot component. Neither needs to know about the other.
interface Props {
  direction: LayoutDirection;
  gap: LayoutSpacing;
  padding: LayoutSpacing;
  marginBottom: LayoutSpacing;
  align: LayoutAlign;
  justify: LayoutJustify;
  columns: LayoutColumns;
  wrap: boolean;
  surface: LayoutSurface;
  children: ReactNode;
}

// Composed class names, never an inline style string built from stored
// values: a stored value can then never become arbitrary CSS even if it
// somehow got past the save guard, and all styling stays in global.css.
export function Container({
  direction,
  gap,
  padding,
  marginBottom,
  align,
  justify,
  columns,
  wrap,
  surface,
  children,
}: Props) {
  const className = [
    'layout',
    `layout-dir-${direction}`,
    `layout-gap-${gap}`,
    `layout-p-${padding}`,
    `layout-mb-${marginBottom}`,
    `layout-align-${align}`,
    `layout-justify-${justify}`,
    `layout-cols-${columns}`,
    wrap ? 'layout-wrap' : null,
    `layout-surface-${surface}`,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={className}>{children}</div>;
}
