// src/lib/puckTypes.ts
//
// Single source of truth for Puck's component Props shape, shared between
// puck.config.tsx and src/lib/puckAdapter.ts as a type-only import, so
// renaming a component in one can't silently break the other.
import type { Slot } from '@puckeditor/core';
import type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
  VideoMode,
} from '../types';

export type BulletItem = { text: string };

// Every container-shaped component shares this shape. EntryCard, BadgeRow and
// MediaGrid exist only to carry different defaultProps — see puck.config.tsx —
// and all four collapse to a single stored { type: 'container' }.
export type ContainerProps = {
  children: Slot;
  direction: LayoutDirection;
  gap: LayoutSpacing;
  padding: LayoutSpacing;
  marginBottom: LayoutSpacing;
  align: LayoutAlign;
  justify: LayoutJustify;
  columns: LayoutColumns;
  wrap: boolean;
  surface: LayoutSurface;
};

export type PuckComponentProps = {
  Container: ContainerProps;
  EntryCard: ContainerProps;
  BadgeRow: ContainerProps;
  MediaGrid: ContainerProps;
  Heading: { text: string; level: 'h2' | 'h3' | 'h4' };
  Text: { html: string; variant: 'body' | 'subtitle' | 'small' };
  Dates: { text: string };
  Bullets: { items: BulletItem[] };
  Badge: { text: string; accent: boolean; year: string };
  Image: { src: string; alt: string; caption: string };
  Video: { mode: VideoMode; url: string; poster: string; caption: string };
};
