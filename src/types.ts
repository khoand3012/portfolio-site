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

export interface Job {
  type: 'job';
  company: string;
  dates: string;
  role?: string;
  bullets?: string[];
}

export interface PlaceholderEntry {
  type: 'placeholder';
  company: string;
  note: string;
}

export interface Education {
  type: 'education';
  school: string;
  dates: string;
  degree: string;
  bullets?: string[];
  dissertation?: string;
}

export interface Certificate {
  text: string;
  accent?: boolean;
}

export interface CertificateGroupBlock {
  type: 'certificate-group';
  heading: string;
  certificates: Certificate[];
}

export type GalleryItemType = 'photo' | 'video';

export interface GalleryItemBlock {
  type: 'gallery-item';
  itemType: GalleryItemType;
  image?: string;
  videoUrl?: string;
}

export interface NoteBlock {
  type: 'note';
  text: string;
}

export type Block =
  | Job
  | PlaceholderEntry
  | Education
  | CertificateGroupBlock
  | GalleryItemBlock
  | NoteBlock;

export interface Hero {
  name: string;
  initials: string;
  role: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  profile: string;
}

export interface Tab {
  label: string;
  blocks: Block[];
}

export interface PortfolioData {
  hero: Hero;
  tabs: {
    teaching: Tab;
    internationalEducation: Tab;
    testing: Tab;
    academicBackground: Tab;
    publications: Tab;
    talks: Tab;
    media: Tab;
  };
  footer: string;
}

// ---------------------------------------------------------------------------
// Generic block model (v2). Added alongside the v1 types above; the swap
// happens in one atomic change (see the phase A plan). The layout unions are
// re-exported from src/lib/layoutOptions.ts rather than redeclared, so the
// values the editor offers and the types the code checks cannot drift apart.
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
  children: NewBlock[];
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

/**
 * Temporary name. Becomes `Block` in the atomic swap (plan Task 6), at which
 * point this alias and every v1 interface above are deleted.
 */
export type NewBlock =
  | ContainerBlock
  | HeadingBlock
  | TextBlock
  | DatesBlock
  | BulletsBlock
  | BadgeBlock
  | ImageBlock
  | VideoBlock;

/** Becomes `Tab` in the atomic swap (plan Task 6). */
export interface TabV2 {
  /**
   * Stable identifier. Generated with crypto.randomUUID() when the owner
   * creates a tab; taken verbatim from the v1 object key when a document is
   * migrated. NEVER derived from the label — renaming a tab must not
   * invalidate a save that references it.
   */
  id: string;
  label: string;
  blocks: NewBlock[];
}
