import type { ReactNode } from 'react';

// Inline SVGs rather than an icon package. The only one already in the tree is
// lucide-react, and that is a transitive dependency of Puck's bundle, not
// something this app declares — importing it directly would break the day Puck
// drops it. Same approach as MetaItem.tsx.
//
// Every icon here is decorative (aria-hidden): each one sits inside a control
// that carries its own accessible name, so announcing the glyph too would just
// double it up. An icon-only button therefore MUST set aria-label itself.
function icon(paths: ReactNode, size = 14) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export const HERO_ICON = icon(
  <>
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
);

export const TABS_ICON = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M3 9h18M9 9v11" />
  </>,
);

export const PREVIEW_ICON = icon(
  <>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);

export const CLOSE_ICON = icon(<path d="M18 6 6 18M6 6l12 12" />, 16);

export const TRASH_ICON = icon(
  <>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
    <path d="M10 11v6M14 11v6" />
  </>,
  15,
);

// The tab strip's scroll arrows. Sized to match CLOSE_ICON rather than the
// 14px default: they sit beside 13.5px tab labels and read as undersized at
// the smaller size.
export const CHEVRON_LEFT_ICON = icon(<path d="m15 18-6-6 6-6" />, 16);

export const CHEVRON_RIGHT_ICON = icon(<path d="m9 18 6-6-6-6" />, 16);
