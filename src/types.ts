import type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
  VideoMode,
} from './lib/layoutOptions';

// Shape of content/portfolio.json. Keep in sync with that file — see CLAUDE.md.

export interface Hero {
  name: string;
  /**
   * Legacy field, retained only so documents saved before the avatar work
   * still validate. Nothing reads it: the avatar's text fallback is derived
   * from `name` at render time (src/lib/initials.ts), and `/admin` no longer
   * offers it as an input, so it decays on the owner's next hero save.
   */
  initials?: string;
  /**
   * Uploaded avatar image. Either a relative `/api/media/<uuid>.<ext>` path
   * served by app/api/media, or an absolute http(s) URL the owner pasted.
   * Validated at the save boundary by isSafeAvatarUrl (src/lib/avatarUrl.ts)
   * — never rendered as a src without passing that check.
   */
  avatarUrl?: string;
  role: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  dob?: string;
  credential?: string;
  /** May be an empty string — the owner is not required to write a profile. */
  profile: string;
}

// ---------------------------------------------------------------------------
// Generic block model. The layout unions are re-exported from
// src/lib/layoutOptions.ts rather than redeclared, so the values the editor
// offers and the types the code checks cannot drift apart.
// ---------------------------------------------------------------------------

export type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
  VideoMode,
};

export interface ContainerBlock {
  type: 'container';
  children: Block[];
  direction: LayoutDirection;
  gap: LayoutSpacing;
  padding: LayoutSpacing;
  marginBottom: LayoutSpacing;
  align: LayoutAlign;
  justify: LayoutJustify;
  /** Only consulted when direction === 'grid'; inert otherwise. */
  columns: LayoutColumns;
  /** Only consulted when direction === 'row'; inert otherwise. */
  wrap: boolean;
  surface: LayoutSurface;
}

export interface HeadingBlock {
  type: 'heading';
  /** Plain text — rendered as text, never as markup. */
  text: string;
  level: 'h2' | 'h3' | 'h4';
}

export interface TextBlock {
  type: 'text';
  /** Sanitized HTML, NOT plain text. Sanitized server-side at save time. */
  html: string;
  variant: 'body' | 'subtitle' | 'small';
}

export interface DatesBlock {
  type: 'dates';
  /** Plain text. */
  text: string;
}

export interface BulletsBlock {
  type: 'bullets';
  /** Sanitized HTML fragments, one per <li>. NOT plain text. */
  items: string[];
}

export interface BadgeBlock {
  type: 'badge';
  /** Plain text. */
  text: string;
  accent?: boolean;
  year?: string;
}

export interface ImageBlock {
  type: 'image';
  src?: string;
  alt?: string;
  caption?: string;
}

export interface VideoBlock {
  type: 'video';
  mode: VideoMode;
  url?: string;
  poster?: string;
  caption?: string;
}

export type Block =
  | ContainerBlock
  | HeadingBlock
  | TextBlock
  | DatesBlock
  | BulletsBlock
  | BadgeBlock
  | ImageBlock
  | VideoBlock;

export interface Tab {
  /**
   * Stable identifier. Generated with crypto.randomUUID() when the owner
   * creates a tab; taken verbatim from the v1 object key when a document is
   * migrated. NEVER derived from the label — renaming a tab must not
   * invalidate a save that references it.
   */
  id: string;
  label: string;
  blocks: Block[];
}

export interface PortfolioData {
  version: 2;
  hero: Hero;
  tabs: Tab[];
  footer: string;
}
