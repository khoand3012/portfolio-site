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
// The classes are grouped into "box" (the element's own painted area) and
// "flow" (how it arranges its children) because the two render paths put
// them in different places:
//
//   Public page: one element carries both — blocks are its direct children.
//   Editor:      Puck interposes its drop-zone element between the component
//                and the blocks. The flow classes must sit on the DROP ZONE
//                (or flex-direction has only the drop zone to act on, and
//                every container looks vertical), while the box classes stay
//                on an outer element — Puck's area/zone depth tracking, which
//                decides which zone accepts a drop, expects the drop zone to
//                be nested INSIDE the component element, not to be it.
//
// Both paths compose from the same two lists here so they cannot drift.
function boxClasses(layout: ContainerLayout): (string | null)[] {
  return [
    'layout',
    `layout-p-${layout.padding}`,
    `layout-mb-${layout.marginBottom}`,
    `layout-surface-${layout.surface}`,
  ];
}

function flowClasses(layout: ContainerLayout): (string | null)[] {
  return [
    `layout-dir-${layout.direction}`,
    `layout-gap-${layout.gap}`,
    `layout-align-${layout.align}`,
    `layout-justify-${layout.justify}`,
    `layout-cols-${layout.columns}`,
    layout.wrap ? 'layout-wrap' : null,
  ];
}

const join = (classes: (string | null)[]): string =>
  classes.filter(Boolean).join(' ');

/** One element carrying everything — the public page's single-element form. */
export function containerClassName(layout: ContainerLayout): string {
  return join([...boxClasses(layout), ...flowClasses(layout)]);
}

/** Editor only: the outer element Puck's drop zone nests inside. */
export function containerBoxClassName(layout: ContainerLayout): string {
  return join(boxClasses(layout));
}

/** Editor only: handed to Puck's drop zone, which holds the blocks. */
export function containerFlowClassName(layout: ContainerLayout): string {
  return join(['layout', ...flowClasses(layout)]);
}

export function Container({ children, ...layout }: Props) {
  return <div className={containerClassName(layout)}>{children}</div>;
}
