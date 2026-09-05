import type { ReactNode } from 'react';
import type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
} from '../types';

export interface ContainerLayout {
  direction: LayoutDirection;
  gap: LayoutSpacing;
  padding: LayoutSpacing;
  marginBottom: LayoutSpacing;
  align: LayoutAlign;
  justify: LayoutJustify;
  columns: LayoutColumns;
  wrap: boolean;
  surface: LayoutSurface;
}

// Takes the layout fields plus arbitrary children rather than a whole
// ContainerBlock, so the same component serves both render paths: the public
// page passes children through BlockRenderer, and puck.config.tsx passes
// Puck's slot component. Neither needs to know about the other.
interface Props extends ContainerLayout {
  children: ReactNode;
}

// Composed class names, never an inline style string built from stored
// values: a stored value can then never become arbitrary CSS even if it
// somehow got past the save guard, and all styling stays in global.css.
//
// Exported because the editor cannot reuse the <Container> element itself:
// Puck renders a slot as its own drop-zone element, and the blocks are that
// element's children — so in the editor these classes must be handed to the
// drop zone instead (see puck.config.tsx). Both paths compose the class list
// here so they cannot drift.
export function containerClassName(layout: ContainerLayout): string {
  return [
    'layout',
    `layout-dir-${layout.direction}`,
    `layout-gap-${layout.gap}`,
    `layout-p-${layout.padding}`,
    `layout-mb-${layout.marginBottom}`,
    `layout-align-${layout.align}`,
    `layout-justify-${layout.justify}`,
    `layout-cols-${layout.columns}`,
    layout.wrap ? 'layout-wrap' : null,
    `layout-surface-${layout.surface}`,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Container({ children, ...layout }: Props) {
  return <div className={containerClassName(layout)}>{children}</div>;
}
