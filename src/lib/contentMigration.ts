// src/lib/contentMigration.ts
//
// Converts a v1 portfolio document (fixed tab keys, six hard-coded block
// variants) into the v2 generic model. Runs on EVERY read of a still-v1
// document — see portfolioContent.ts — rather than as a one-off script,
// because production content lives in Netlify Blobs with no convenient
// script access, and because that also covers every history/ snapshot for
// free.
//
// Two invariants this file must never lose:
//
// 1. DETERMINISM. No randomUUID() here. saveTabBlocksAction looks a tab up by
//    id inside its own read-modify-write; if this function invented a random
//    id per read, that lookup would miss and every save against an
//    unmigrated document would fail with "that tab no longer exists". A
//    migrated tab takes its v1 object key verbatim.
//
// 2. ESCAPING. v1 values are plain text; TextBlock.html and BulletsBlock.items
//    are HTML. Every string crossing that boundary is escaped, or a bullet
//    reading "R&D" silently becomes broken markup on the public page.
import type {
  BadgeBlock,
  ContainerBlock,
  Hero,
  NewBlock,
  TabV2,
  TextBlock,
} from '../types';

export interface PortfolioDataV2 {
  version: 2;
  hero: Hero;
  tabs: TabV2[];
  footer: string;
}

const V1_TAB_KEYS = [
  'teaching',
  'internationalEducation',
  'testing',
  'academicBackground',
  'publications',
  'talks',
  'media',
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Container defaults, so each call site states only what differs. */
function container(over: Partial<ContainerBlock> = {}): ContainerBlock {
  return {
    type: 'container',
    children: [],
    direction: 'stack',
    gap: 'sm',
    padding: 'none',
    marginBottom: 'none',
    align: 'stretch',
    justify: 'start',
    columns: 'auto',
    wrap: false,
    surface: 'none',
    ...over,
  };
}

/** The .block-card look: padding and outer margin now come from the container. */
function card(children: NewBlock[]): ContainerBlock {
  return container({
    surface: 'card',
    padding: 'lg',
    marginBottom: 'lg',
    children,
  });
}

/** The .placeholder.card look. */
function dashed(children: NewBlock[]): ContainerBlock {
  return container({
    surface: 'dashed',
    padding: 'xl',
    marginBottom: 'lg',
    children,
  });
}

/** The .block-title-row look: heading left, dates right, baseline-aligned. */
function titleRow(heading: string, dates: string): ContainerBlock {
  return container({
    direction: 'row',
    justify: 'between',
    align: 'baseline',
    wrap: true,
    children: [
      { type: 'heading', text: heading, level: 'h3' },
      { type: 'dates', text: dates },
    ],
  });
}

function text(value: string, variant: TextBlock['variant']): TextBlock {
  return { type: 'text', html: `<p>${escapeHtml(value)}</p>`, variant };
}

/**
 * Bullet items are HTML fragments. Tiptap always wraps a list item's content
 * in a block node, so migrated items carry the same <p> the editor will
 * produce — kept consistent deliberately, and zeroed out in CSS.
 */
function bullets(items: string[]): NewBlock {
  return {
    type: 'bullets',
    items: items.map((item) => `<p>${escapeHtml(item)}</p>`),
  };
}

// biome-ignore lint/suspicious/noExplicitAny: v1 documents are untyped input read from the content store; each branch below narrows by the `type` discriminator before touching fields.
type V1Block = Record<string, any>;

function migrateBlock(block: V1Block): NewBlock {
  switch (block.type) {
    case 'job':
      return card([
        titleRow(block.company, block.dates),
        ...(block.role ? [text(block.role, 'subtitle')] : []),
        ...(block.bullets?.length ? [bullets(block.bullets)] : []),
      ]);
    case 'education':
      return card([
        titleRow(block.school, block.dates),
        ...(block.degree ? [text(block.degree, 'subtitle')] : []),
        ...(block.bullets?.length ? [bullets(block.bullets)] : []),
        ...(block.dissertation ? [text(block.dissertation, 'small')] : []),
      ]);
    case 'placeholder':
      return dashed([
        { type: 'heading', text: block.company, level: 'h3' },
        text(block.note, 'body'),
      ]);
    case 'certificate-group':
      return card([
        { type: 'heading', text: block.heading, level: 'h3' },
        container({
          direction: 'row',
          wrap: true,
          gap: 'sm',
          children: (block.certificates ?? []).map(
            (cert: { text: string; accent?: boolean }): BadgeBlock => ({
              type: 'badge',
              text: cert.text,
              accent: cert.accent ?? false,
            }),
          ),
        }),
      ]);
    case 'gallery-item':
      return block.itemType === 'video'
        ? {
            type: 'video',
            // Every existing video is a link-out, which is exactly what
            // GalleryTile did. Nothing is silently turned into an embed.
            mode: 'link',
            ...(block.videoUrl ? { url: block.videoUrl } : {}),
            ...(block.image ? { poster: block.image } : {}),
          }
        : { type: 'image', ...(block.image ? { src: block.image } : {}) };
    case 'note':
      // Notes lose their centered-italic treatment here — the one intentional
      // visual difference the migration produces.
      return dashed([text(block.text, 'body')]);
    default:
      throw new Error(
        `Cannot migrate unknown v1 block type "${String(block.type)}"`,
      );
  }
}

function isV2(raw: unknown): raw is PortfolioDataV2 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { version?: unknown }).version === 2
  );
}

function isV1(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) return false;
  const tabs = (raw as { tabs?: unknown }).tabs;
  return typeof tabs === 'object' && tabs !== null && !Array.isArray(tabs);
}

export function migratePortfolioData(raw: unknown): PortfolioDataV2 {
  if (isV2(raw)) return raw;
  if (!isV1(raw)) {
    throw new Error(
      'Unrecognized portfolio document: neither a v2 document nor a v1-shaped one',
    );
  }

  const doc = raw as {
    hero: Hero;
    tabs: Record<string, { label: string; blocks?: V1Block[] } | undefined>;
    footer: string;
  };

  const tabs: TabV2[] = [];
  for (const key of V1_TAB_KEYS) {
    const tab = doc.tabs[key];
    if (!tab) continue;
    const migrated = (tab.blocks ?? []).map(migrateBlock);
    tabs.push({
      // The v1 key verbatim — deterministic, and readable when debugging.
      id: key,
      label: tab.label,
      blocks:
        key === 'media' && migrated.length > 0
          ? [
              container({
                direction: 'grid',
                columns: 'auto',
                gap: 'md',
                children: migrated,
              }),
            ]
          : migrated,
    });
  }

  return { version: 2, hero: doc.hero, tabs, footer: doc.footer };
}
