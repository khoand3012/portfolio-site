// src/lib/layoutOptions.ts
//
// Single source of truth for every constrained layout value on
// ContainerBlock, plus VideoBlock's mode. Three consumers read from here and
// none may keep its own copy: puck.config.tsx's select `options`,
// assertBlocksShape's allow-list checks in app/admin/actions.ts, and
// Container.tsx's className mapping. The string-union types are derived from
// the tuples rather than hand-written beside them, so a value can't exist in
// one place and not the other.
//
// The *_LABELS records are typed by the union, so adding a value to a tuple
// without giving it a label is a compile error, not a blank dropdown entry.

export const LAYOUT_DIRECTIONS = ['stack', 'row', 'grid'] as const;
export const LAYOUT_SPACINGS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
export const LAYOUT_ALIGNS = [
  'start',
  'center',
  'end',
  'stretch',
  'baseline',
] as const;
export const LAYOUT_JUSTIFIES = ['start', 'center', 'end', 'between'] as const;
export const LAYOUT_COLUMNS = ['1', '2', '3', '4', 'auto'] as const;
export const LAYOUT_SURFACES = ['none', 'card', 'dashed'] as const;
export const VIDEO_MODES = ['embed', 'link'] as const;

export type LayoutDirection = (typeof LAYOUT_DIRECTIONS)[number];
export type LayoutSpacing = (typeof LAYOUT_SPACINGS)[number];
export type LayoutAlign = (typeof LAYOUT_ALIGNS)[number];
export type LayoutJustify = (typeof LAYOUT_JUSTIFIES)[number];
export type LayoutColumns = (typeof LAYOUT_COLUMNS)[number];
export type LayoutSurface = (typeof LAYOUT_SURFACES)[number];
export type VideoMode = (typeof VIDEO_MODES)[number];

const DIRECTION_LABELS: Record<LayoutDirection, string> = {
  stack: 'Stack (vertical)',
  row: 'Row (horizontal)',
  grid: 'Grid',
};
const SPACING_LABELS: Record<LayoutSpacing, string> = {
  none: 'None',
  xs: 'Extra small',
  sm: 'Small',
  md: 'Medium',
  lg: 'Large',
  xl: 'Extra large',
};
const ALIGN_LABELS: Record<LayoutAlign, string> = {
  start: 'Start',
  center: 'Center',
  end: 'End',
  stretch: 'Stretch',
  baseline: 'Baseline',
};
const JUSTIFY_LABELS: Record<LayoutJustify, string> = {
  start: 'Start',
  center: 'Center',
  end: 'End',
  between: 'Space between',
};
const COLUMN_LABELS: Record<LayoutColumns, string> = {
  '1': '1 column',
  '2': '2 columns',
  '3': '3 columns',
  '4': '4 columns',
  auto: 'Auto-fit',
};
const SURFACE_LABELS: Record<LayoutSurface, string> = {
  none: 'None',
  card: 'Card',
  dashed: 'Dashed outline',
};
const VIDEO_MODE_LABELS: Record<VideoMode, string> = {
  embed: 'Embed (plays a direct video file)',
  link: 'Link (YouTube, Vimeo, or any page URL)',
};

function toOptions<T extends string>(
  values: readonly T[],
  labels: Record<T, string>,
): { label: string; value: T }[] {
  return values.map((value) => ({ label: labels[value], value }));
}

export const LAYOUT_DIRECTION_OPTIONS = toOptions(
  LAYOUT_DIRECTIONS,
  DIRECTION_LABELS,
);
export const LAYOUT_SPACING_OPTIONS = toOptions(
  LAYOUT_SPACINGS,
  SPACING_LABELS,
);
export const LAYOUT_ALIGN_OPTIONS = toOptions(LAYOUT_ALIGNS, ALIGN_LABELS);
export const LAYOUT_JUSTIFY_OPTIONS = toOptions(
  LAYOUT_JUSTIFIES,
  JUSTIFY_LABELS,
);
export const LAYOUT_COLUMN_OPTIONS = toOptions(LAYOUT_COLUMNS, COLUMN_LABELS);
export const LAYOUT_SURFACE_OPTIONS = toOptions(
  LAYOUT_SURFACES,
  SURFACE_LABELS,
);
export const VIDEO_MODE_OPTIONS = toOptions(VIDEO_MODES, VIDEO_MODE_LABELS);

export function isOneOf<T extends readonly string[]>(
  list: T,
  value: unknown,
): value is T[number] {
  return (
    typeof value === 'string' && (list as readonly string[]).includes(value)
  );
}
