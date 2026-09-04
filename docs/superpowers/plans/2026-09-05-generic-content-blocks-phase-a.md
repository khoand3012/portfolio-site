# Generic Content Blocks (Phase A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace this site's six hard-coded `Block` variants with a generic, recursive block model (one layout container plus seven leaves), convert every stored document to it without losing content, and rewire the renderer, editor, adapter and save guard onto it.

**Architecture:** `src/types.ts`'s closed union becomes eight generic variants, one of which (`container`) holds a slot of children plus dropdown-constrained layout options applied as composed CSS class names. `PortfolioData.tabs` becomes an ordered array of `{ id, label, blocks }`. A pure `migratePortfolioData` runs on every read so stored v1 documents, the seed, and history snapshots all present as v2. Two fields (`text.html`, `bullets.items`) hold sanitized HTML, sanitized server-side at save time before the write.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript 5.9 (strict, `noUncheckedIndexedAccess`), Puck 0.23 (`@puckeditor/core`), Vitest 2 + Testing Library + jsdom, Biome 2, Netlify Blobs. New dependency: `sanitize-html` (+ `@types/sanitize-html`).

**Spec:** `docs/superpowers/specs/2026-08-28-content-structure-and-hero-editing-design.md`

## Global Constraints

- **Content fidelity is the hard rule.** Never reword, summarize, or invent CV copy. Every string in `content/portfolio.json` is a factual claim about a real person's career. Where this plan moves content, it moves it byte-for-byte (modulo the HTML escaping specified in Task 3).
- **Design tokens are fixed.** Use the existing `--sand-100`…`--sand-900` primitives and the `--color-*` / `--spacing-*` / `--radius-*` tokens in `src/styles/global.css`. Do not introduce new hex values.
- **`--color-text-secondary` intentionally equals `--color-text-primary`.** Never convey hierarchy with a lighter shade of this palette — use font-size and weight. (Verified: 90% brown on cream is 4.58:1; 75% is 3.38:1, failing WCAG AA.)
- **One global stylesheet.** All CSS goes in `src/styles/global.css`. No per-component styles, no CSS modules.
- **`biome.json` must stay strict JSON with no `//` comments.** A syntax error there silently falls back to full defaults instead of erroring.
- **Puck AI guardrails stay intact.** Per-field `ai.instructions` of the form "only add new items; never edit or rewrite the text of an existing one", and the handler-level `ai.context` / `ai.mode: 'assembly'` in `app/api/puck/[...all]/route.ts` are unchanged.
- **The admin panel's five auth layers are load-bearing.** Do not consolidate or "simplify" the checks in `auth.ts`, `middleware.ts`, `app/admin/page.tsx`, `app/admin/actions.ts`, or `app/api/puck/[...all]/route.ts`.
- **Verification commands:** `npm run check` (`tsc --noEmit`), `npm run test` (`vitest run`), `npm run build`, `npm run lint` (`biome check .`).

## Read This Before Task 6

**Tasks 1–5 are additive and leave the repo fully green. Tasks 6–8 are a single atomic change that cannot be green in between.**

Sixteen files import from `src/types.ts` and four hard-reference the old variant names. The moment `Block` is redefined, `BlockRenderer`'s exhaustive switch, `puckAdapter`'s twelve variant references, `puck.config.tsx`'s component map and `assertBlocksShape` all break together. There is no ordering that keeps `tsc` passing across tasks 6, 7 and 8.

So, for those three tasks only:

- **The per-task verification is `npx vitest run <specific test file>`, not `npm run check`.** Repo-wide `tsc` is expected to fail until the end of Task 8. This is why Tasks 3 and 4 (migration and sanitization — the two places where a mistake is silent rather than loud) are pure-function work done *before* the window opens.
- **Intermediate commits in tasks 6 and 7 will not compile.** This deliberately departs from CLAUDE.md's "run check, test and build before committing" rule, which resumes — and must pass — at the end of Task 8. Commit anyway: a bisectable trail through the swap is worth more than three commits' worth of green, and this is a feature branch.

Tasks 1–5 and 9 follow the normal rule: full green gate before commit.

---

### Task 1: Layout options module

The single source of truth for every constrained layout value. Three consumers read from it — `puck.config.tsx`'s dropdowns, `assertBlocksShape`'s allow-lists, and `Container.tsx`'s className mapping — and none may keep its own copy.

**Deviation from the spec, deliberate:** the spec sketches the `Layout*` string-union types in `src/types.ts`. Derive them from the tuples here instead and re-export from `types.ts`. A hand-written union next to a hand-written tuple is exactly the drift this module exists to prevent.

**Files:**
- Create: `src/lib/layoutOptions.ts`
- Test: `src/lib/layoutOptions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `LAYOUT_DIRECTIONS`, `LAYOUT_SPACINGS`, `LAYOUT_ALIGNS`, `LAYOUT_JUSTIFIES`, `LAYOUT_COLUMNS`, `LAYOUT_SURFACES`, `VIDEO_MODES` (readonly string tuples); types `LayoutDirection`, `LayoutSpacing`, `LayoutAlign`, `LayoutJustify`, `LayoutColumns`, `LayoutSurface`, `VideoMode`; option arrays `LAYOUT_DIRECTION_OPTIONS`, `LAYOUT_SPACING_OPTIONS`, `LAYOUT_ALIGN_OPTIONS`, `LAYOUT_JUSTIFY_OPTIONS`, `LAYOUT_COLUMN_OPTIONS`, `LAYOUT_SURFACE_OPTIONS`, `VIDEO_MODE_OPTIONS` (each `{ label: string; value: <union> }[]`); and `isOneOf(list, value): value is T[number]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/layoutOptions.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isOneOf,
  LAYOUT_ALIGNS,
  LAYOUT_ALIGN_OPTIONS,
  LAYOUT_COLUMNS,
  LAYOUT_COLUMN_OPTIONS,
  LAYOUT_DIRECTIONS,
  LAYOUT_DIRECTION_OPTIONS,
  LAYOUT_JUSTIFIES,
  LAYOUT_JUSTIFY_OPTIONS,
  LAYOUT_SPACINGS,
  LAYOUT_SPACING_OPTIONS,
  LAYOUT_SURFACES,
  LAYOUT_SURFACE_OPTIONS,
  VIDEO_MODES,
  VIDEO_MODE_OPTIONS,
} from './layoutOptions';

// Every dropdown the editor shows must offer exactly the values the save
// guard accepts. A value in one but not the other is either a save that
// fails with a confusing error, or a stored value the CSS has no rule for.
const PAIRS: [readonly string[], readonly { value: string }[]][] = [
  [LAYOUT_DIRECTIONS, LAYOUT_DIRECTION_OPTIONS],
  [LAYOUT_SPACINGS, LAYOUT_SPACING_OPTIONS],
  [LAYOUT_ALIGNS, LAYOUT_ALIGN_OPTIONS],
  [LAYOUT_JUSTIFIES, LAYOUT_JUSTIFY_OPTIONS],
  [LAYOUT_COLUMNS, LAYOUT_COLUMN_OPTIONS],
  [LAYOUT_SURFACES, LAYOUT_SURFACE_OPTIONS],
  [VIDEO_MODES, VIDEO_MODE_OPTIONS],
];

describe('layoutOptions', () => {
  it('offers exactly the allowed values in every option list', () => {
    for (const [values, options] of PAIRS) {
      expect(options.map((o) => o.value)).toEqual([...values]);
    }
  });

  it('gives every option a non-empty label', () => {
    for (const [, options] of PAIRS) {
      for (const option of options) {
        expect((option as { label: string }).label.length).toBeGreaterThan(0);
      }
    }
  });

  it('narrows known values and rejects unknown ones', () => {
    expect(isOneOf(LAYOUT_DIRECTIONS, 'grid')).toBe(true);
    expect(isOneOf(LAYOUT_DIRECTIONS, 'flex')).toBe(false);
    expect(isOneOf(LAYOUT_DIRECTIONS, 3)).toBe(false);
    expect(isOneOf(LAYOUT_SURFACES, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/layoutOptions.test.ts`
Expected: FAIL — `Failed to resolve import "./layoutOptions"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/layoutOptions.ts`:

```ts
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
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}
```

- [ ] **Step 4: Run the full green gate**

Run: `npx vitest run src/lib/layoutOptions.test.ts` → Expected: PASS (3 tests)
Run: `npm run check` → Expected: no output, exit 0
Run: `npm run test` → Expected: all existing tests still pass
Run: `npm run lint` → Expected: no diagnostics

- [ ] **Step 5: Commit**

```bash
git add src/lib/layoutOptions.ts src/lib/layoutOptions.test.ts
git commit -m "Add layoutOptions as the single source of truth for layout values"
```

---

### Task 2: New block interfaces, added alongside the old ones

Purely additive: the new interfaces and a temporary `NewBlock` union land in `src/types.ts` while the existing `Block` union and its six variants stay untouched. Nothing imports `NewBlock` yet, so the repo stays green and Tasks 3–5 have real types to build against.

`NewBlock` is temporary scaffolding and is deleted in Task 6, where `Block` becomes this union.

**Files:**
- Modify: `src/types.ts` (append; change nothing that exists)

**Interfaces:**
- Consumes: `LayoutDirection`, `LayoutSpacing`, `LayoutAlign`, `LayoutJustify`, `LayoutColumns`, `LayoutSurface`, `VideoMode` from `src/lib/layoutOptions.ts` (Task 1).
- Produces: `ContainerBlock`, `HeadingBlock`, `TextBlock`, `DatesBlock`, `BulletsBlock`, `BadgeBlock`, `ImageBlock`, `VideoBlock`, the `NewBlock` union, and `TabV2`. Re-exports the seven layout types so downstream files import them from `../types` like every other content type.

- [ ] **Step 1: Append the new model to `src/types.ts`**

Add at the end of the file, leaving everything above it as-is:

```ts
// ---------------------------------------------------------------------------
// Generic block model (v2). Added alongside the v1 types above; the swap
// happens in one atomic change (see the phase A plan). The layout unions are
// re-exported from src/lib/layoutOptions.ts rather than redeclared, so the
// values the editor offers and the types the code checks cannot drift apart.
// ---------------------------------------------------------------------------
import type {
  LayoutAlign,
  LayoutColumns,
  LayoutDirection,
  LayoutJustify,
  LayoutSpacing,
  LayoutSurface,
  VideoMode,
} from './lib/layoutOptions';

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
```

- [ ] **Step 2: Run the full green gate**

Run: `npm run check` → Expected: no output, exit 0
Run: `npm run test` → Expected: all existing tests pass, unchanged
Run: `npm run lint` → Expected: no diagnostics

If `tsc` complains that `import type` may not follow other statements, move the `import type { ... } from './lib/layoutOptions'` line to the top of the file with the other imports — `src/types.ts` currently has none, so it becomes line 1.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "Add the generic block interfaces alongside the existing model"
```

---

### Task 3: Content migration

The most important task in the phase. `migratePortfolioData` converts v1 documents to v2 on every read, so a bug here silently corrupts a real person's CV rather than throwing.

Two properties matter beyond correctness, and both get their own test:

- **Determinism.** This runs on *every* read of a still-v1 document. If tab ids were random, the ids the admin page rendered would differ from the ids `saveTabBlocksAction` generates when it re-reads — and that action looks tabs up by id, so every save against an unmigrated document would fail. Migrated tabs take their v1 object key verbatim.
- **Escaping.** v1 strings are plain text and become HTML. A bullet reading `R&D` must survive as `R&amp;D`, not as broken markup.

**Files:**
- Create: `src/lib/contentMigration.ts`
- Create: `src/lib/contentMigration.test.ts`
- Create: `src/lib/__fixtures__/portfolio-v1.json` (a byte copy of today's `content/portfolio.json`)

**Interfaces:**
- Consumes: the block interfaces and `TabV2` from `src/types.ts` (Task 2).
- Produces: `migratePortfolioData(raw: unknown): PortfolioDataV2` and the `PortfolioDataV2` type (`{ version: 2; hero: Hero; tabs: TabV2[]; footer: string }`). Task 6 renames `PortfolioDataV2` to `PortfolioData`.

- [ ] **Step 1: Copy today's seed to a fixture**

```bash
mkdir -p src/lib/__fixtures__
cp content/portfolio.json src/lib/__fixtures__/portfolio-v1.json
```

This freezes the real v1 document as test input, so the no-content-lost test keeps testing the real thing after `content/portfolio.json` is rewritten in Task 9.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/contentMigration.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import v1Fixture from './__fixtures__/portfolio-v1.json';
import { migratePortfolioData } from './contentMigration';
import type { NewBlock } from '../types';

/** Every string reachable in a v1 document, in document order. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) collectStrings(v, out);
  else if (value && typeof value === 'object')
    for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function flatten(blocks: NewBlock[], out: NewBlock[] = []): NewBlock[] {
  for (const block of blocks) {
    out.push(block);
    if (block.type === 'container') flatten(block.children, out);
  }
  return out;
}

describe('migratePortfolioData', () => {
  it('loses no content when migrating the real v1 document', () => {
    const v2 = migratePortfolioData(v1Fixture);
    const haystack = JSON.stringify(v2);
    for (const original of collectStrings(v1Fixture)) {
      // Strings that land in a rich-text field are HTML-escaped on the way
      // in, so search for the escaped form — otherwise this test fails
      // confusingly on the first "&" the site owner ever types.
      expect(haystack).toContain(JSON.stringify(escapeHtml(original)).slice(1, -1));
    }
  });

  it('is deterministic — the same v1 input always yields identical output', () => {
    // Not a stylistic preference: saveTabBlocksAction looks tabs up by id in
    // a freshly-read document. Random ids here would break every save against
    // a not-yet-migrated document.
    expect(migratePortfolioData(v1Fixture)).toEqual(
      migratePortfolioData(v1Fixture),
    );
  });

  it('reuses the v1 tab key as the tab id', () => {
    const v2 = migratePortfolioData(v1Fixture);
    expect(v2.tabs.map((t) => t.id)).toEqual([
      'teaching',
      'internationalEducation',
      'testing',
      'academicBackground',
      'publications',
      'talks',
      'media',
    ]);
  });

  it('is idempotent — a v2 document passes through untouched', () => {
    const v2 = migratePortfolioData(v1Fixture);
    expect(migratePortfolioData(v2)).toEqual(v2);
  });

  it('escapes HTML metacharacters moving into rich-text fields', () => {
    const v2 = migratePortfolioData({
      hero: { name: 'N', initials: 'N', role: 'R', profile: 'P' },
      tabs: {
        teaching: {
          label: 'Teaching',
          blocks: [
            {
              type: 'job',
              company: 'Acme',
              dates: '2020',
              role: 'R&D Lead',
              bullets: ['Grew 5 < 10 teams & shipped <b>fast</b>.'],
            },
          ],
        },
      },
      footer: 'F',
    });
    const blocks = flatten(v2.tabs[0]?.blocks ?? []);
    const text = blocks.find((b) => b.type === 'text');
    const bullets = blocks.find((b) => b.type === 'bullets');
    expect(text).toEqual({
      type: 'text',
      html: '<p>R&amp;D Lead</p>',
      variant: 'subtitle',
    });
    expect(bullets).toEqual({
      type: 'bullets',
      items: ['<p>Grew 5 &lt; 10 teams &amp; shipped &lt;b&gt;fast&lt;/b&gt;.</p>'],
    });
  });

  it('maps each v1 block type to its v2 shape', () => {
    const v2 = migratePortfolioData({
      hero: { name: 'N', initials: 'N', role: 'R', profile: 'P' },
      tabs: {
        teaching: {
          label: 'Teaching',
          blocks: [
            { type: 'job', company: 'Acme', dates: '2020' },
            { type: 'placeholder', company: 'TBD', note: 'Later.' },
            {
              type: 'education',
              school: 'U',
              dates: '2018',
              degree: 'MA',
              dissertation: 'Thesis.',
            },
            {
              type: 'certificate-group',
              heading: 'Certs',
              certificates: [{ text: 'IELTS 8.0', accent: true }],
            },
            { type: 'note', text: 'A note.' },
          ],
        },
        media: {
          label: 'Media',
          blocks: [
            { type: 'gallery-item', itemType: 'photo', image: 'p.jpg' },
            {
              type: 'gallery-item',
              itemType: 'video',
              videoUrl: 'https://v.example/x',
              image: 'poster.jpg',
            },
          ],
        },
      },
      footer: 'F',
    });

    const teaching = flatten(v2.tabs[0]?.blocks ?? []);
    // A job with no role and no bullets yields no subtitle and no bullet list.
    expect(teaching.filter((b) => b.type === 'text')).toHaveLength(2); // placeholder note + note block
    expect(teaching.filter((b) => b.type === 'bullets')).toHaveLength(0);
    expect(teaching.find((b) => b.type === 'dates')).toEqual({
      type: 'dates',
      text: '2020',
    });
    expect(teaching.find((b) => b.type === 'badge')).toEqual({
      type: 'badge',
      text: 'IELTS 8.0',
      accent: true,
    });

    // The media tab's blocks are wrapped in one grid container, preserving
    // the .gallery-grid look the removed wrapperClassName special case gave.
    const mediaTop = v2.tabs[1]?.blocks ?? [];
    expect(mediaTop).toHaveLength(1);
    expect(mediaTop[0]).toMatchObject({
      type: 'container',
      direction: 'grid',
      columns: 'auto',
    });
    const media = flatten(mediaTop);
    expect(media.find((b) => b.type === 'image')).toEqual({
      type: 'image',
      src: 'p.jpg',
    });
    expect(media.find((b) => b.type === 'video')).toEqual({
      type: 'video',
      mode: 'link',
      url: 'https://v.example/x',
      poster: 'poster.jpg',
    });
  });

  it('throws on a document that is neither v1 nor v2', () => {
    expect(() => migratePortfolioData({ nonsense: true })).toThrow(
      /unrecognized/i,
    );
    expect(() => migratePortfolioData(null)).toThrow(/unrecognized/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/contentMigration.test.ts`
Expected: FAIL — `Failed to resolve import "./contentMigration"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/contentMigration.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/contentMigration.test.ts`
Expected: PASS (7 tests)

If the no-content-lost test fails, do **not** relax it — find the dropped string. That test is the whole reason this task exists.

- [ ] **Step 6: Run the full green gate**

Run: `npm run check` → Expected: exit 0
Run: `npm run test` → Expected: all pass
Run: `npm run lint` → Expected: no diagnostics

- [ ] **Step 7: Commit**

```bash
git add src/lib/contentMigration.ts src/lib/contentMigration.test.ts src/lib/__fixtures__/portfolio-v1.json
git commit -m "Add the v1 to v2 content migration"
```

---

### Task 4: Rich-text sanitization

`Text` and `Bullets` render stored values with `dangerouslySetInnerHTML`. This module is what makes that defensible: it runs at the save boundary, so whatever is stored is safe by construction rather than trusted.

It is a **transform**, not a validator — disallowed markup is stripped and the save proceeds. A paste from Word carrying `<span style>` should lose the span, not fail the save.

**Files:**
- Modify: `package.json` (add `sanitize-html`, `@types/sanitize-html`)
- Create: `src/lib/sanitizeBlocks.ts`
- Create: `src/lib/sanitizeBlocks.test.ts`

**Interfaces:**
- Consumes: `NewBlock` from `src/types.ts` (Task 2).
- Produces: `sanitizeBlocks(blocks: NewBlock[]): NewBlock[]` — returns a new tree, never mutates its input.

- [ ] **Step 1: Install the dependency**

```bash
npm install sanitize-html && npm install --save-dev @types/sanitize-html
```

`sanitize-html` is Node-only (it parses with htmlparser2) and is imported only by server code — `sanitizeBlocks.ts` must never be imported by a `'use client'` component.

- [ ] **Step 2: Write the failing test**

Create `src/lib/sanitizeBlocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { sanitizeBlocks } from './sanitizeBlocks';
import type { NewBlock } from '../types';

const container = (children: NewBlock[]): NewBlock => ({
  type: 'container',
  children,
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
});

const text = (html: string): NewBlock => ({ type: 'text', html, variant: 'body' });

describe('sanitizeBlocks', () => {
  it('strips script tags, event handlers, styles and unknown tags', () => {
    const [block] = sanitizeBlocks([
      text(
        '<p>Hi<script>alert(1)</script></p>' +
          '<p onclick="steal()">Click</p>' +
          '<p style="color:red">Red</p>' +
          '<iframe src="https://evil.example"></iframe>',
      ),
    ]);
    const html = (block as { html: string }).html;
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('style');
    expect(html).not.toContain('iframe');
    expect(html).toContain('Hi');
    expect(html).toContain('Click');
  });

  it('keeps the allowed inline markup', () => {
    const [block] = sanitizeBlocks([
      text('<p><strong>Bold</strong> <em>italic</em> <u>under</u></p>'),
    ]);
    expect((block as { html: string }).html).toBe(
      '<p><strong>Bold</strong> <em>italic</em> <u>under</u></p>',
    );
  });

  it('keeps safe links, adds rel=noopener, and drops javascript: hrefs', () => {
    const [safe] = sanitizeBlocks([
      text('<p><a href="https://example.com">go</a></p>'),
    ]);
    expect((safe as { html: string }).html).toContain('rel="noopener"');
    expect((safe as { html: string }).html).toContain('href="https://example.com"');

    const [unsafe] = sanitizeBlocks([
      text('<p><a href="javascript:alert(1)">go</a></p>'),
    ]);
    expect((unsafe as { html: string }).html).not.toContain('javascript:');
  });

  it('sanitizes bullet items', () => {
    const [block] = sanitizeBlocks([
      { type: 'bullets', items: ['<p>ok<script>bad()</script></p>'] },
    ]);
    expect((block as { items: string[] }).items[0]).toBe('<p>ok</p>');
  });

  it('sanitizes nested containers at every depth', () => {
    const result = sanitizeBlocks([
      container([container([text('<p>deep<script>x</script></p>')])]),
    ]);
    const outer = result[0] as { children: NewBlock[] };
    const inner = outer.children[0] as { children: NewBlock[] };
    expect((inner.children[0] as { html: string }).html).toBe('<p>deep</p>');
  });

  it('leaves plain-text fields untouched', () => {
    const blocks: NewBlock[] = [
      { type: 'heading', text: 'A <b>literal</b> title', level: 'h3' },
      { type: 'dates', text: '2020 – 2021' },
      { type: 'badge', text: 'IELTS 8.0', accent: true, year: '2025' },
      { type: 'image', src: 'x.jpg', alt: 'a <b>', caption: 'c & d' },
    ];
    expect(sanitizeBlocks(blocks)).toEqual(blocks);
  });

  it('does not mutate its input', () => {
    const input = [text('<p>hi<script>x</script></p>')];
    const snapshot = JSON.parse(JSON.stringify(input));
    sanitizeBlocks(input);
    expect(input).toEqual(snapshot);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/sanitizeBlocks.test.ts`
Expected: FAIL — `Failed to resolve import "./sanitizeBlocks"`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/sanitizeBlocks.ts`:

```ts
// src/lib/sanitizeBlocks.ts
//
// Two fields in the content model hold HTML rather than plain text —
// TextBlock.html and BulletsBlock.items — because Puck's richtext field is
// Tiptap-backed and stores editor.getHTML(). Text.tsx and Bullets.tsx render
// those values with dangerouslySetInnerHTML, so this module is what makes
// that safe: it runs at the save boundary in app/admin/actions.ts, which
// means whatever reaches the content store (and therefore the public page)
// is already reduced to the allow-list below.
//
// This is a TRANSFORM, not a validation. Disallowed markup is stripped and
// the save proceeds — a paste from Word carrying <span style> should lose the
// span, not fail the save. If formatting "disappears", the allow-list is the
// answer, not a bug.
//
// Server-only: sanitize-html parses with htmlparser2 and must never be
// imported by a 'use client' component.
import sanitizeHtml from 'sanitize-html';
import type { NewBlock } from '../types';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'br', 'strong', 'em', 'u', 'a'],
  allowedAttributes: { a: ['href', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto'],
  // Matches the rel already set on the outbound link in the media components.
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', { rel: 'noopener' }),
  },
};

const clean = (html: string): string => sanitizeHtml(html, OPTIONS);

export function sanitizeBlocks(blocks: NewBlock[]): NewBlock[] {
  return blocks.map((block): NewBlock => {
    switch (block.type) {
      case 'container':
        return { ...block, children: sanitizeBlocks(block.children) };
      case 'text':
        return { ...block, html: clean(block.html) };
      case 'bullets':
        return { ...block, items: block.items.map(clean) };
      default:
        // heading/dates/badge/image/video carry only plain-text and URL
        // fields, which are rendered as text or gated by isSafeHttpUrl.
        return block;
    }
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/sanitizeBlocks.test.ts`
Expected: PASS (7 tests)

If the `rel="noopener"` assertion fails because sanitize-html emits attributes in a different order, assert on `toContain('rel="noopener"')` only — never loosen the `javascript:` or `<script>` assertions.

- [ ] **Step 6: Run the full green gate**

Run: `npm run check` → Expected: exit 0
Run: `npm run test` → Expected: all pass
Run: `npm run lint` → Expected: no diagnostics
Run: `npm run build` → Expected: build succeeds (confirms the new dependency bundles cleanly)

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/sanitizeBlocks.ts src/lib/sanitizeBlocks.test.ts
git commit -m "Add save-time sanitization for the two rich-text block fields"
```

---

### Task 5: The eight block components and their CSS

Additive: these render but nothing routes to them until Task 6. The old components keep working meanwhile.

**Spacing ownership rule for the CSS in this task:** surface and leaf classes carry **no outer spacing and no padding** — the container owns all of it. So `.block-card` loses both its `margin-bottom` and its `padding` (they become `layout-mb-lg` / `layout-p-lg`, which the migration already emits), and `.tag-row` disappears entirely in favour of a row container's `gap`. Without this, container spacing and baked-in spacing double up.

**Files:**
- Create: `src/components/Container.tsx`, `Heading.tsx`, `Text.tsx`, `Dates.tsx`, `Bullets.tsx`, `Badge.tsx`, `Image.tsx`, `Video.tsx`
- Create: `src/components/Container.test.tsx`, `Badge.test.tsx`, `Text.test.tsx`, `Image.test.tsx`, `Video.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: the block interfaces from `src/types.ts` (Task 2); `LAYOUT_*` types from `src/lib/layoutOptions.ts` (Task 1).
- Produces: `Container` (props: `ContainerBlock`'s layout fields plus `children: ReactNode` — it does **not** take a block, so both the public renderer and Puck's slot can supply children), `Heading` (`{ block: HeadingBlock }`), `Text` (`{ block: TextBlock }`), `Dates` (`{ block: DatesBlock }`), `Bullets` (`{ block: BulletsBlock }`), `Badge` (`{ block: BadgeBlock }`), `Image` (`{ block: ImageBlock }`), `Video` (`{ block: VideoBlock }`), and `isSafeHttpUrl(url: string): boolean` exported from `src/components/Image.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `src/components/Container.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Container } from './Container';

describe('Container', () => {
  it('composes one class per layout value', () => {
    const { container } = render(
      <Container
        direction="grid"
        gap="md"
        padding="lg"
        marginBottom="none"
        align="baseline"
        justify="between"
        columns="auto"
        wrap={true}
        surface="card"
      >
        <span>child</span>
      </Container>,
    );
    const el = container.firstElementChild as HTMLElement;
    expect(el.className.split(' ')).toEqual(
      expect.arrayContaining([
        'layout',
        'layout-dir-grid',
        'layout-gap-md',
        'layout-p-lg',
        'layout-mb-none',
        'layout-align-baseline',
        'layout-justify-between',
        'layout-cols-auto',
        'layout-wrap',
        'layout-surface-card',
      ]),
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('omits the wrap class when wrap is false', () => {
    const { container } = render(
      <Container
        direction="row"
        gap="sm"
        padding="none"
        marginBottom="none"
        align="start"
        justify="start"
        columns="auto"
        wrap={false}
        surface="none"
      >
        <span>c</span>
      </Container>,
    );
    expect(
      (container.firstElementChild as HTMLElement).className,
    ).not.toContain('layout-wrap');
  });
});
```

Create `src/components/Text.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Text } from './Text';

describe('Text', () => {
  it('renders allowed markup as elements', () => {
    const { container } = render(
      <Text block={{ type: 'text', html: '<p>a <strong>b</strong></p>', variant: 'body' }} />,
    );
    expect(container.querySelector('strong')).not.toBeNull();
  });

  it('renders escaped metacharacters as visible text, not markup', () => {
    const { container } = render(
      <Text
        block={{ type: 'text', html: '<p>5 &lt; 10 &amp; rising</p>', variant: 'small' }}
      />,
    );
    expect(screen.getByText('5 < 10 & rising')).toBeInTheDocument();
    expect(container.querySelector('.text-small')).not.toBeNull();
  });
});
```

Create `src/components/Badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders the year as a prefix when present', () => {
    render(<Badge block={{ type: 'badge', text: 'IELTS 8.0', year: '2025' }} />);
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('IELTS 8.0')).toBeInTheDocument();
  });

  it('applies the accent class only when accent is set', () => {
    const { container, rerender } = render(
      <Badge block={{ type: 'badge', text: 'Plain' }} />,
    );
    expect(container.querySelector('.tag.accent')).toBeNull();
    rerender(<Badge block={{ type: 'badge', text: 'Hot', accent: true }} />);
    expect(container.querySelector('.tag.accent')).not.toBeNull();
  });
});
```

Create `src/components/Image.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Image } from './Image';

describe('Image', () => {
  it('renders the image and caption when the src is a safe http URL', () => {
    const { container } = render(
      <Image
        block={{
          type: 'image',
          src: 'https://cdn.example/a.jpg',
          alt: 'A photo',
          caption: 'On stage',
        }}
      />,
    );
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn.example/a.jpg',
    );
    expect(screen.getByAltText('A photo')).toBeInTheDocument();
    expect(screen.getByText('On stage')).toBeInTheDocument();
  });

  it('refuses a non-http src and falls back to the empty state', () => {
    const { container } = render(
      <Image block={{ type: 'image', src: 'javascript:alert(1)' }} />,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('+ Add photo')).toBeInTheDocument();
  });

  it('renders the empty state when no src is set', () => {
    render(<Image block={{ type: 'image' }} />);
    expect(screen.getByText('+ Add photo')).toBeInTheDocument();
  });
});
```

Create `src/components/Video.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Video } from './Video';

describe('Video', () => {
  it('renders a video element in embed mode', () => {
    const { container } = render(
      <Video block={{ type: 'video', mode: 'embed', url: 'https://cdn.example/a.mp4' }} />,
    );
    expect(container.querySelector('video')).not.toBeNull();
  });

  it('renders a link tile in link mode', () => {
    render(
      <Video block={{ type: 'video', mode: 'link', url: 'https://youtube.example/w' }} />,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', 'https://youtube.example/w');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('refuses a non-http URL in either mode', () => {
    const { container: embed } = render(
      <Video block={{ type: 'video', mode: 'embed', url: 'javascript:alert(1)' }} />,
    );
    expect(embed.querySelector('video')).toBeNull();

    const { container: linked } = render(
      <Video block={{ type: 'video', mode: 'link', url: 'javascript:alert(1)' }} />,
    );
    expect(linked.querySelector('a')).toBeNull();
  });

  it('renders the caption when present', () => {
    render(
      <Video
        block={{ type: 'video', mode: 'link', url: 'https://v.example/x', caption: 'Talk' }}
      />,
    );
    expect(screen.getByText('Talk')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/components/Container.test.tsx src/components/Text.test.tsx src/components/Badge.test.tsx src/components/Image.test.tsx src/components/Video.test.tsx`
Expected: FAIL — unresolved imports for all five components.

- [ ] **Step 3: Write the components**

Create `src/components/Container.tsx`:

```tsx
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
```

Create `src/components/Heading.tsx`:

```tsx
import type { HeadingBlock } from '../types';

interface Props {
  block: HeadingBlock;
}

export function Heading({ block }: Props) {
  const Tag = block.level;
  return <Tag className="block-heading">{block.text}</Tag>;
}
```

Create `src/components/Text.tsx`:

```tsx
import type { TextBlock } from '../types';

interface Props {
  block: TextBlock;
}

const VARIANT_CLASS: Record<TextBlock['variant'], string> = {
  body: 'text-body',
  subtitle: 'text-subtitle',
  small: 'text-small',
};

export function Text({ block }: Props) {
  return (
    <div
      className={VARIANT_CLASS[block.variant]}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: block.html is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section. This is an enforced invariant, not a trusted-input assumption.
      dangerouslySetInnerHTML={{ __html: block.html }}
    />
  );
}
```

Create `src/components/Dates.tsx`:

```tsx
import type { DatesBlock } from '../types';

interface Props {
  block: DatesBlock;
}

export function Dates({ block }: Props) {
  return <span className="dates">{block.text}</span>;
}
```

Create `src/components/Bullets.tsx`:

```tsx
import type { BulletsBlock } from '../types';

interface Props {
  block: BulletsBlock;
}

export function Bullets({ block }: Props) {
  if (block.items.length === 0) return null;
  return (
    <ul className="bullet-list">
      {block.items.map((item, i) => (
        <li
          // biome-ignore lint/suspicious/noArrayIndexKey: Static content list rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
          key={i}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: each item is stored content, reduced to a small tag allow-list by src/lib/sanitizeBlocks.ts at save time — see that module and the spec's "Rich text" section.
          dangerouslySetInnerHTML={{ __html: item }}
        />
      ))}
    </ul>
  );
}
```

Create `src/components/Badge.tsx`:

```tsx
import type { BadgeBlock } from '../types';

interface Props {
  block: BadgeBlock;
}

export function Badge({ block }: Props) {
  return (
    <span className={`tag${block.accent ? ' accent' : ''}`}>
      {block.year && <span className="tag-year">{block.year}</span>}
      {block.text}
    </span>
  );
}
```

Create `src/components/Image.tsx`:

```tsx
import type { ImageBlock } from '../types';

interface Props {
  block: ImageBlock;
}

// Hardcoded constant SVG path markup, never user input — safe to inject directly.
export const PHOTO_ICON_PATHS =
  '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>';
export const VIDEO_ICON_PATHS =
  '<path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/>';

// Carried over from GalleryTile.tsx unchanged: an admin-supplied URL must be
// proven http(s) before it becomes an href or src, so a javascript: value can
// never be rendered as a live URL.
export function isSafeHttpUrl(url: string): boolean {
  try {
    return ['http:', 'https:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function MediaPlaceholder({
  paths,
  label,
}: {
  paths: string;
  label: string;
}) {
  return (
    <div className="gallery-tile">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
        dangerouslySetInnerHTML={{ __html: paths }}
      />
      {label}
    </div>
  );
}

export function Image({ block }: Props) {
  if (!block.src || !isSafeHttpUrl(block.src)) {
    return <MediaPlaceholder paths={PHOTO_ICON_PATHS} label="+ Add photo" />;
  }
  return (
    <figure className="media-figure">
      {/* biome-ignore lint/performance/noImgElement: block.src is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass. */}
      <img className="media-image" src={block.src} alt={block.alt ?? ''} />
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
```

Create `src/components/Video.tsx`:

```tsx
import type { VideoBlock } from '../types';
import { isSafeHttpUrl, MediaPlaceholder, VIDEO_ICON_PATHS } from './Image';

interface Props {
  block: VideoBlock;
}

export function Video({ block }: Props) {
  if (!block.url || !isSafeHttpUrl(block.url)) {
    return <MediaPlaceholder paths={VIDEO_ICON_PATHS} label="+ Add video" />;
  }

  const poster =
    block.poster && isSafeHttpUrl(block.poster) ? block.poster : undefined;

  // mode is an explicit stored choice, not sniffed from the URL: an R2 object
  // URL need not end in .mp4, and a YouTube watch URL will never play in a
  // <video> element, so neither case is reliably detectable.
  if (block.mode === 'embed') {
    return (
      <figure className="media-figure">
        {/* biome-ignore lint/a11y/useMediaCaption: caption text is optional site-owner content rendered below the player; no timed-track data exists for these files. */}
        <video
          className="media-video"
          controls
          preload="metadata"
          poster={poster}
          src={block.url}
        />
        {block.caption && (
          <figcaption className="media-caption">{block.caption}</figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className="media-figure">
      <a
        className="gallery-tile"
        href={block.url}
        target="_blank"
        rel="noopener"
      >
        {poster ? (
          // biome-ignore lint/performance/noImgElement: block.poster is an arbitrary admin-supplied URL; next/image would need remotePatterns/domain allowlisting configured first, which is out of scope for this pass.
          <img className="media-image" src={poster} alt="" />
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: Hardcoded constant SVG path markup, never user input — safe to inject directly.
              dangerouslySetInnerHTML={{ __html: VIDEO_ICON_PATHS }}
            />
            <span>Watch video</span>
          </>
        )}
      </a>
      {block.caption && (
        <figcaption className="media-caption">{block.caption}</figcaption>
      )}
    </figure>
  );
}
```

- [ ] **Step 4: Add the CSS**

In `src/styles/global.css`:

**(a)** Remove `padding: var(--spacing-lg);` and `margin-bottom: var(--spacing-lg);` from `.block-card` — the container now owns both.

**(b)** Delete the whole `.tag-row` rule — a row container's `gap` replaces it.

**(c)** In `.placeholder`, delete `text-align: center;`, `font-style: italic;`, `padding`, and `margin-bottom`; then delete the now-redundant `.placeholder.card` and `.placeholder.card h3` rules, folding their `font-family`/`font-size`/`color` into `.block-heading` below.

**(d)** Rename the `.block-card h3` selector to `.block-heading` and the `.block-card ul` / `li` selectors to `.bullet-list` / `.bullet-list li`, so they no longer depend on being inside a card. Keep every declaration.

**(e)** Append:

```css
/* Generic layout containers. One class per stored layout value — see
   src/lib/layoutOptions.ts, which is the single source of truth these
   class names must stay in step with. */
.layout {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.layout-dir-stack { flex-direction: column; }
.layout-dir-row { flex-direction: row; }
.layout-dir-grid { display: grid; }
.layout-wrap { flex-wrap: wrap; }

.layout-gap-none { gap: 0; }
.layout-gap-xs { gap: var(--spacing-xs); }
.layout-gap-sm { gap: var(--spacing-sm); }
.layout-gap-md { gap: var(--spacing-md); }
.layout-gap-lg { gap: var(--spacing-lg); }
.layout-gap-xl { gap: var(--spacing-xl); }

.layout-p-none { padding: 0; }
.layout-p-xs { padding: var(--spacing-xs); }
.layout-p-sm { padding: var(--spacing-sm); }
.layout-p-md { padding: var(--spacing-md); }
.layout-p-lg { padding: var(--spacing-lg); }
.layout-p-xl { padding: var(--spacing-xl); }

.layout-mb-none { margin-bottom: 0; }
.layout-mb-xs { margin-bottom: var(--spacing-xs); }
.layout-mb-sm { margin-bottom: var(--spacing-sm); }
.layout-mb-md { margin-bottom: var(--spacing-md); }
.layout-mb-lg { margin-bottom: var(--spacing-lg); }
.layout-mb-xl { margin-bottom: var(--spacing-xl); }

.layout-align-start { align-items: flex-start; }
.layout-align-center { align-items: center; }
.layout-align-end { align-items: flex-end; }
.layout-align-stretch { align-items: stretch; }
.layout-align-baseline { align-items: baseline; }

.layout-justify-start { justify-content: flex-start; }
.layout-justify-center { justify-content: center; }
.layout-justify-end { justify-content: flex-end; }
.layout-justify-between { justify-content: space-between; }

.layout-dir-grid.layout-cols-1 { grid-template-columns: 1fr; }
.layout-dir-grid.layout-cols-2 { grid-template-columns: repeat(2, 1fr); }
.layout-dir-grid.layout-cols-3 { grid-template-columns: repeat(3, 1fr); }
.layout-dir-grid.layout-cols-4 { grid-template-columns: repeat(4, 1fr); }
.layout-dir-grid.layout-cols-auto {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

.layout-surface-card {
  background: var(--color-bg-content);
  border: 1px solid var(--color-border-default);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}
.layout-surface-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-border-strong);
  box-shadow:
    var(--shadow-md),
    inset 3px 0 0 var(--color-accent-default);
}
.layout-surface-dashed {
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
}

/* Text variants. Hierarchy comes from size and weight only — never a
   lighter shade, which would fail WCAG AA against the cream background. */
.text-body { font-size: 14px; color: var(--color-text-secondary); }
.text-small { font-size: 13px; color: var(--color-text-secondary); }
.text-subtitle {
  font-size: 12.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: var(--color-primary-default);
}
.text-body p,
.text-small p,
.text-subtitle p { margin: 0 0 var(--spacing-sm); }
.text-body p:last-child,
.text-small p:last-child,
.text-subtitle p:last-child { margin-bottom: 0; }

/* Inline marks produced by the rich-text editor. */
.text-body a,
.text-small a,
.bullet-list a {
  color: var(--color-accent-default);
  text-decoration: underline;
}
.text-body strong,
.text-small strong,
.bullet-list strong { font-weight: 600; color: var(--color-text-primary); }

/* Tiptap always wraps a list item's content in a block node, so each
   bullet's stored HTML is <p>…</p>. Zero its margin rather than doing
   string surgery on the HTML in the render path. */
.bullet-list li > p { margin: 0; }

.tag-year {
  font-size: 10px;
  font-weight: 700;
  margin-right: var(--spacing-xs);
  opacity: 0.85;
}

.media-figure { margin: 0; }
.media-image,
.media-video {
  width: 100%;
  border-radius: var(--radius-md);
  display: block;
}
.media-image { aspect-ratio: 4 / 3; object-fit: cover; }
.media-caption {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin-top: var(--spacing-xs);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/components/Container.test.tsx src/components/Text.test.tsx src/components/Badge.test.tsx src/components/Image.test.tsx src/components/Video.test.tsx`
Expected: PASS (13 tests)

- [ ] **Step 6: Run the full green gate**

Run: `npm run check` → Expected: exit 0
Run: `npm run test` → Expected: all pass, **including the existing `JobCard`, `CertificateGroup`, `GalleryTile` and `BlockRenderer` tests** — the old components still work, they just lost some baked-in spacing.
Run: `npm run lint` → Expected: no diagnostics

- [ ] **Step 7: Commit**

```bash
git add src/components src/styles/global.css
git commit -m "Add the generic block components and their layout CSS"
```

---

### Task 6: Swap the model and the public render path

**The red window opens here.** `npm run check` will fail from this task's first edit until the end of Task 8. Verify with the named vitest files only.

**Files:**
- Modify: `src/types.ts` (delete the six v1 interfaces and the v1 `Tab`/`PortfolioData`; rename `NewBlock` → `Block`, `TabV2` → `Tab`; add `version: 2` to `PortfolioData`)
- Modify: `src/lib/contentMigration.ts` (rename `PortfolioDataV2` → `PortfolioData`, import from `../types`)
- Modify: `src/lib/sanitizeBlocks.ts` (rename `NewBlock` → `Block`)
- Modify: `src/lib/portfolioContent.ts` (run the migration on every read)
- Rewrite: `src/components/BlockRenderer.tsx`
- Modify: `app/page.tsx`, `src/components/TabbedContent.tsx`
- Delete: `src/components/JobCard.tsx`, `EducationCard.tsx`, `PlaceholderCard.tsx`, `CertificateGroup.tsx`, `GalleryTile.tsx`, `Note.tsx`, and `JobCard.test.tsx`, `CertificateGroup.test.tsx`, `GalleryTile.test.tsx`
- Modify: `src/components/BlockRenderer.test.tsx`, `TabbedContent.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: `Block`, `Tab`, `PortfolioData` (final names) from `src/types.ts`; `BlockRenderer` handling all eight variants with a `container` case that recurses; `deriveSlugs(tabs: { label: string }[]): string[]` exported from `app/page.tsx`.

- [ ] **Step 1: Finalize `src/types.ts`**

Delete `Job`, `PlaceholderEntry`, `Education`, `Certificate`, `CertificateGroupBlock`, `GalleryItemType`, `GalleryItemBlock`, `NoteBlock`, the old `Block` union, the old `Tab`, and the old `PortfolioData`. Keep `Hero`. Rename `NewBlock` → `Block` and `TabV2` → `Tab` (and the doc-comments that call them temporary). Add:

```ts
export interface PortfolioData {
  version: 2;
  hero: Hero;
  tabs: Tab[];
  footer: string;
}
```

Then in `src/lib/contentMigration.ts`, delete the local `PortfolioDataV2` interface and import `PortfolioData`, `Block` and `Tab` from `../types`, updating the signature to `migratePortfolioData(raw: unknown): PortfolioData`. In `src/lib/sanitizeBlocks.ts`, change `NewBlock` to `Block`. In both test files, change `NewBlock` to `Block` and `PortfolioDataV2` to `PortfolioData`.

- [ ] **Step 2: Wire the migration into every read**

In `src/lib/portfolioContent.ts`, import `migratePortfolioData` and apply it at all three points where a document is produced. Replace the two read functions' bodies:

```ts
export async function readPortfolioContentStrict(): Promise<PortfolioData> {
  const store = getContentStore(STORE_NAME);
  const current = await store.get(CURRENT_KEY);
  // Migrate on read rather than as a one-off script: production content lives
  // in Netlify Blobs with no convenient script access, and this covers every
  // history/ snapshot for free. migratePortfolioData is deterministic, so the
  // same stored bytes always yield the same tab ids — load-bearing for
  // saveTabBlocksAction's id lookup.
  return migratePortfolioData(current ?? seedData);
}

export async function readPortfolioContentWithEtag(): Promise<{
  data: PortfolioData;
  etag: string | null;
}> {
  const store = getContentStore(STORE_NAME);
  const [current, etag] = await Promise.all([
    store.get(CURRENT_KEY),
    store.getEtag(CURRENT_KEY),
  ]);
  return { data: migratePortfolioData(current ?? seedData), etag };
}
```

And in `getPortfolioContent`'s catch block, replace `return seedData as PortfolioData;` with `return migratePortfolioData(seedData);`. The `as PortfolioData` casts all disappear — that is the point, since the seed is still v1 at this stage and a cast between incompatible shapes would now be a type error.

- [ ] **Step 3: Rewrite `BlockRenderer.tsx`**

```tsx
import type { Block } from '../types';
import { Badge } from './Badge';
import { Bullets } from './Bullets';
import { Container } from './Container';
import { Dates } from './Dates';
import { Heading } from './Heading';
import { Image } from './Image';
import { Text } from './Text';
import { Video } from './Video';

interface Props {
  block: Block;
}

export function BlockRenderer({ block }: Props) {
  switch (block.type) {
    case 'container':
      return (
        <Container
          direction={block.direction}
          gap={block.gap}
          padding={block.padding}
          marginBottom={block.marginBottom}
          align={block.align}
          justify={block.justify}
          columns={block.columns}
          wrap={block.wrap}
          surface={block.surface}
        >
          {block.children.map((child, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: Static content tree rendered from admin-edited data, not client-side-reorderable UI state, so index keys are safe here.
            <BlockRenderer key={i} block={child} />
          ))}
        </Container>
      );
    case 'heading':
      return <Heading block={block} />;
    case 'text':
      return <Text block={block} />;
    case 'dates':
      return <Dates block={block} />;
    case 'bullets':
      return <Bullets block={block} />;
    case 'badge':
      return <Badge block={block} />;
    case 'image':
      return <Image block={block} />;
    case 'video':
      return <Video block={block} />;
    default: {
      // Exhaustiveness check: a new Block variant with no case here is a compile error.
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 4: Update `app/page.tsx` and `TabbedContent.tsx`**

`app/page.tsx` loses `TAB_ORDER` and the `wrapperClassName` media special case entirely:

```tsx
import { Hero } from '../src/components/Hero';
import { TabbedContent } from '../src/components/TabbedContent';
import { getPortfolioContent } from '../src/lib/portfolioContent';

export const dynamic = 'force-dynamic';

// Tab ids are stable but opaque, so DOM ids come from the label instead —
// keeping the readable id="tab-teaching" anchors the page has always had,
// without storing a second identifier that can drift from the label.
// Exported for its test.
export function deriveSlugs(tabs: { label: string }[]): string[] {
  const seen = new Map<string, number>();
  return tabs.map((tab, i) => {
    const base =
      tab.label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `tab-${i}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${i}`;
  });
}

export default async function HomePage() {
  const data = await getPortfolioContent();
  const slugs = deriveSlugs(data.tabs);

  const tabs = data.tabs.map((tab, i) => ({
    // biome-ignore lint/style/noNonNullAssertion: deriveSlugs returns one slug per tab, by construction.
    slug: slugs[i]!,
    label: tab.label,
    blocks: tab.blocks,
  }));

  return (
    <>
      <Hero hero={data.hero} />
      <TabbedContent tabs={tabs} />
      <footer>
        <div className="wrap">{data.footer}</div>
      </footer>
    </>
  );
}
```

In `TabbedContent.tsx`, delete the `wrapperClassName` field from its `Tab` interface and collapse the conditional in the panel body to the plain `tab.blocks.map(...)` branch. Everything else stays.

- [ ] **Step 5: Delete the v1 components and their tests**

```bash
git rm src/components/JobCard.tsx src/components/JobCard.test.tsx \
       src/components/EducationCard.tsx \
       src/components/PlaceholderCard.tsx \
       src/components/CertificateGroup.tsx src/components/CertificateGroup.test.tsx \
       src/components/GalleryTile.tsx src/components/GalleryTile.test.tsx \
       src/components/Note.tsx
```

- [ ] **Step 6: Update `BlockRenderer.test.tsx` and `TabbedContent.test.tsx`**

Rewrite `BlockRenderer.test.tsx` to cover recursion:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Block } from '../types';
import { BlockRenderer } from './BlockRenderer';

const container = (children: Block[]): Block => ({
  type: 'container',
  children,
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'card',
});

describe('BlockRenderer', () => {
  it('renders nested containers to full depth', () => {
    render(
      <BlockRenderer
        block={container([
          container([{ type: 'heading', text: 'Deep', level: 'h3' }]),
        ])}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Deep' })).toBeInTheDocument();
  });

  it('renders each leaf variant', () => {
    render(
      <BlockRenderer
        block={container([
          { type: 'heading', text: 'Acme', level: 'h3' },
          { type: 'dates', text: '2020' },
          { type: 'text', html: '<p>Role</p>', variant: 'subtitle' },
          { type: 'bullets', items: ['<p>Did a thing.</p>'] },
          { type: 'badge', text: 'IELTS', year: '2025' },
        ])}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeInTheDocument();
    expect(screen.getByText('2020')).toBeInTheDocument();
    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Did a thing.')).toBeInTheDocument();
    expect(screen.getByText('IELTS')).toBeInTheDocument();
  });
});
```

In `TabbedContent.test.tsx`, replace any v1 block fixtures with generic ones (a `heading` block is the simplest) and drop any `wrapperClassName` usage. Add a `deriveSlugs` test in a new `app/page.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { deriveSlugs } from './page';

describe('deriveSlugs', () => {
  it('slugifies labels', () => {
    expect(deriveSlugs([{ label: 'International Education' }])).toEqual([
      'international-education',
    ]);
  });

  it('disambiguates duplicate labels by index', () => {
    expect(deriveSlugs([{ label: 'Talks' }, { label: 'Talks' }])).toEqual([
      'talks',
      'talks-1',
    ]);
  });

  it('falls back for a label with no alphanumerics', () => {
    expect(deriveSlugs([{ label: '—' }])).toEqual(['tab-0']);
  });
});
```

- [ ] **Step 7: Verify the touched tests only**

Run: `npx vitest run src/lib/contentMigration.test.ts src/lib/sanitizeBlocks.test.ts src/components/BlockRenderer.test.tsx src/components/TabbedContent.test.tsx app/page.test.ts`
Expected: PASS

Run: `npm run check` → Expected: **FAIL**, with errors confined to `puck.config.tsx`, `src/lib/puckTypes.ts`, `src/lib/puckAdapter.ts`, `src/lib/puckAdapter.test.ts`, `app/admin/actions.ts`, `app/admin/actions.test.ts`, `src/components/PuckAdmin.tsx`. Any error outside that list means something in this task is wrong — fix it before moving on.

- [ ] **Step 8: Commit (will not compile — see "Read This Before Task 6")**

```bash
git add -A
git commit -m "Swap in the generic block model and public render path"
```

---

### Task 7: Editor plumbing — Puck config and adapter

Still inside the red window.

**Files:**
- Rewrite: `src/lib/puckTypes.ts`, `puck.config.tsx`
- Modify: `src/lib/puckAdapter.ts`, `src/lib/puckAdapter.test.ts`

**Interfaces:**
- Consumes: `Block` and the layout types from `src/types.ts`; every component from Task 5; the option arrays from Task 1.
- Produces: `PuckComponentProps` with keys `Container`, `EntryCard`, `BadgeRow`, `MediaGrid`, `Heading`, `Text`, `Dates`, `Bullets`, `Badge`, `Image`, `Video`; `blocksToPuckData(blocks: Block[]): Data<PuckComponentProps>`; `puckDataToBlocks(data: Data): Block[]`; `KNOWN_COMPONENT_NAMES`.

- [ ] **Step 1: Rewrite `src/lib/puckTypes.ts`**

```ts
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
```

- [ ] **Step 2: Rewrite `puck.config.tsx`**

Keep the existing file header comment about `ai` keys coming from `@puckeditor/plugin-ai`'s declaration merging. Then:

```tsx
import type { Config } from '@puckeditor/core';
import type { ComponentType } from 'react';
import { Badge } from './src/components/Badge';
import { Bullets } from './src/components/Bullets';
import { Container } from './src/components/Container';
import { Dates } from './src/components/Dates';
import { Heading } from './src/components/Heading';
import { Image } from './src/components/Image';
import { Text } from './src/components/Text';
import { Video } from './src/components/Video';
import {
  LAYOUT_ALIGN_OPTIONS,
  LAYOUT_COLUMN_OPTIONS,
  LAYOUT_DIRECTION_OPTIONS,
  LAYOUT_JUSTIFY_OPTIONS,
  LAYOUT_SPACING_OPTIONS,
  LAYOUT_SURFACE_OPTIONS,
  VIDEO_MODE_OPTIONS,
} from './src/lib/layoutOptions';
import type { ContainerProps, PuckComponentProps } from './src/lib/puckTypes';

// Inline-only marks for a bullet item: no block structure inside an <li>.
// textAlign is off deliberately — the container has no text-align option,
// so offering it here would produce markup the sanitizer strips.
const INLINE_RICHTEXT = {
  blockquote: false,
  bulletList: false,
  code: false,
  codeBlock: false,
  heading: false,
  horizontalRule: false,
  listItem: false,
  orderedList: false,
  strike: false,
  textAlign: false,
} as const;

const bulletsField = {
  type: 'array' as const,
  arrayFields: {
    text: { type: 'richtext' as const, options: INLINE_RICHTEXT },
  },
  defaultItemProps: { text: '' },
  getItemSummary: (item: { text: string }) =>
    item.text.replace(/<[^>]*>/g, '') || 'Bullet',
  ai: {
    instructions:
      'Only add new bullets. Never edit or rewrite the text of an existing bullet.',
  },
};

const layoutFields = {
  children: { type: 'slot' as const },
  direction: { type: 'select' as const, options: LAYOUT_DIRECTION_OPTIONS },
  gap: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  padding: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  marginBottom: { type: 'select' as const, options: LAYOUT_SPACING_OPTIONS },
  align: { type: 'select' as const, options: LAYOUT_ALIGN_OPTIONS },
  justify: { type: 'select' as const, options: LAYOUT_JUSTIFY_OPTIONS },
  columns: { type: 'select' as const, options: LAYOUT_COLUMN_OPTIONS },
  wrap: {
    type: 'radio' as const,
    options: [
      { label: 'Wrap', value: true },
      { label: 'No wrap', value: false },
    ],
  },
  surface: { type: 'select' as const, options: LAYOUT_SURFACE_OPTIONS },
};

const BASE_LAYOUT: Omit<ContainerProps, 'children'> = {
  direction: 'stack',
  gap: 'sm',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
};

const renderContainer = ({
  children: Children,
  ...layout
}: {
  children: ComponentType;
} & Omit<ContainerProps, 'children'>) => (
  <Container {...layout}>
    <Children />
  </Container>
);

export const puckConfig: Config<PuckComponentProps> = {
  components: {
    Container: {
      fields: layoutFields,
      defaultProps: { ...BASE_LAYOUT, children: [] },
      render: renderContainer,
    },
    // EntryCard/BadgeRow/MediaGrid differ from Container ONLY in
    // defaultProps. They are insert-time scaffolding: puckDataToBlocks
    // collapses all four to { type: 'container' }, so an EntryCard reopens
    // as a Container — lossless in content, mildly lossy in labelling.
    // Puck's insertAction runs populateIds over the whole defaultProps tree
    // and regenerates a fresh id for every slot child, so inserting the same
    // preset twice cannot collide; the ids below are placeholders.
    EntryCard: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        surface: 'card',
        padding: 'lg',
        marginBottom: 'lg',
        children: [
          {
            type: 'Container',
            props: {
              id: 'seed-title-row',
              ...BASE_LAYOUT,
              direction: 'row',
              justify: 'between',
              align: 'baseline',
              wrap: true,
              children: [
                {
                  type: 'Heading',
                  props: { id: 'seed-heading', text: '', level: 'h3' },
                },
                { type: 'Dates', props: { id: 'seed-dates', text: '' } },
              ],
            },
          },
          {
            type: 'Text',
            props: { id: 'seed-subtitle', html: '', variant: 'subtitle' },
          },
          { type: 'Bullets', props: { id: 'seed-bullets', items: [] } },
        ],
      },
      render: renderContainer,
    },
    BadgeRow: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        direction: 'row',
        wrap: true,
        gap: 'sm',
        children: [],
      },
      render: renderContainer,
    },
    MediaGrid: {
      fields: layoutFields,
      defaultProps: {
        ...BASE_LAYOUT,
        direction: 'grid',
        columns: 'auto',
        gap: 'md',
        children: [],
      },
      render: renderContainer,
    },
    Heading: {
      fields: {
        text: {
          type: 'text',
          ai: {
            instructions:
              'A real name — never invent or alter an existing heading.',
          },
        },
        level: {
          type: 'select',
          options: [
            { label: 'H2', value: 'h2' },
            { label: 'H3', value: 'h3' },
            { label: 'H4', value: 'h4' },
          ],
        },
      },
      defaultProps: { text: '', level: 'h3' },
      render: (props) => (
        <Heading block={{ type: 'heading', text: props.text, level: props.level }} />
      ),
    },
    Text: {
      fields: {
        html: {
          type: 'richtext',
          // Same option set as a bullet item: paragraph plus inline marks.
          // Tiptap always wraps content in a block node, so both fields
          // produce <p>…</p> and both are rendered through the same CSS.
          options: INLINE_RICHTEXT,
          ai: {
            instructions:
              'Only add new text. Never rewrite existing text.',
          },
        },
        variant: {
          type: 'select',
          options: [
            { label: 'Body', value: 'body' },
            { label: 'Subtitle', value: 'subtitle' },
            { label: 'Small', value: 'small' },
          ],
        },
      },
      defaultProps: { html: '', variant: 'body' },
      render: (props) => (
        <Text block={{ type: 'text', html: props.html, variant: props.variant }} />
      ),
    },
    Dates: {
      fields: { text: { type: 'text' } },
      defaultProps: { text: '' },
      render: (props) => <Dates block={{ type: 'dates', text: props.text }} />,
    },
    Bullets: {
      fields: { items: bulletsField },
      defaultProps: { items: [] },
      render: (props) => (
        <Bullets
          block={{ type: 'bullets', items: props.items.map((i) => i.text) }}
        />
      ),
    },
    Badge: {
      fields: {
        text: {
          type: 'text',
          ai: {
            instructions:
              "Only add new badges. Never rewrite an existing badge's text.",
          },
        },
        year: { type: 'text' },
        accent: {
          type: 'radio',
          options: [
            { label: 'Accent', value: true },
            { label: 'Normal', value: false },
          ],
        },
      },
      defaultProps: { text: '', year: '', accent: false },
      render: (props) => (
        <Badge
          block={{
            type: 'badge',
            text: props.text,
            accent: props.accent,
            year: props.year || undefined,
          }}
        />
      ),
    },
    Image: {
      fields: {
        src: { type: 'text' },
        alt: { type: 'text' },
        caption: { type: 'text' },
      },
      defaultProps: { src: '', alt: '', caption: '' },
      render: (props) => (
        <Image
          block={{
            type: 'image',
            src: props.src || undefined,
            alt: props.alt || undefined,
            caption: props.caption || undefined,
          }}
        />
      ),
    },
    Video: {
      fields: {
        mode: { type: 'select', options: VIDEO_MODE_OPTIONS },
        url: { type: 'text' },
        poster: { type: 'text' },
        caption: { type: 'text' },
      },
      defaultProps: { mode: 'link', url: '', poster: '', caption: '' },
      render: (props) => (
        <Video
          block={{
            type: 'video',
            mode: props.mode,
            url: props.url || undefined,
            poster: props.poster || undefined,
            caption: props.caption || undefined,
          }}
        />
      ),
    },
  },
};
```

If `Config<PuckComponentProps>` rejects `renderContainer`'s hand-written parameter type, inline the render function into each of the four components instead of sharing it — the shared helper is a convenience, not a requirement.

- [ ] **Step 3: Update `src/lib/puckAdapter.ts`**

Keep the existing file header. Replace `KNOWN_COMPONENT_TYPES` and both conversion functions:

```ts
const KNOWN_COMPONENT_TYPES: Record<keyof PuckComponentProps, true> = {
  Container: true,
  EntryCard: true,
  BadgeRow: true,
  MediaGrid: true,
  Heading: true,
  Text: true,
  Dates: true,
  Bullets: true,
  Badge: true,
  Image: true,
  Video: true,
};
```

```ts
function blockToComponentData(block: Block, id: string): PuckComponentData {
  switch (block.type) {
    case 'container':
      return {
        type: 'Container',
        props: {
          id,
          direction: block.direction,
          gap: block.gap,
          padding: block.padding,
          marginBottom: block.marginBottom,
          align: block.align,
          justify: block.justify,
          columns: block.columns,
          wrap: block.wrap,
          // Slot content lives inline under props, in the same
          // Content<Components> shape as top-level data.content — so one
          // recursive pair of functions handles every depth.
          children: block.children.map((child, i) =>
            blockToComponentData(child, `${id}-${child.type}-${i}`),
          ),
          surface: block.surface,
        },
      };
    case 'heading':
      return { type: 'Heading', props: { id, text: block.text, level: block.level } };
    case 'text':
      return { type: 'Text', props: { id, html: block.html, variant: block.variant } };
    case 'dates':
      return { type: 'Dates', props: { id, text: block.text } };
    case 'bullets':
      return {
        type: 'Bullets',
        props: { id, items: block.items.map((text) => ({ text })) },
      };
    case 'badge':
      return {
        type: 'Badge',
        props: {
          id,
          text: block.text,
          accent: block.accent ?? false,
          year: block.year ?? '',
        },
      };
    case 'image':
      return {
        type: 'Image',
        props: {
          id,
          src: block.src ?? '',
          alt: block.alt ?? '',
          caption: block.caption ?? '',
        },
      };
    case 'video':
      return {
        type: 'Video',
        props: {
          id,
          mode: block.mode,
          url: block.url ?? '',
          poster: block.poster ?? '',
          caption: block.caption ?? '',
        },
      };
    default: {
      const _exhaustive: never = block;
      return _exhaustive;
    }
  }
}

export function blocksToPuckData(blocks: Block[]): Data<PuckComponentProps> {
  return {
    // Path-based ids. Puck requires ids unique across the WHOLE tree for
    // selection and drag-and-drop; the old `${type}-${i}` scheme is only
    // unique within one flat list, so a top-level container and a child
    // container would both be "container-0".
    content: blocks.map((block, i) =>
      blockToComponentData(block, `${block.type}-${i}`),
    ),
    root: {},
  };
}

export function puckDataToBlocks(data: Data): Block[] {
  // Puck's Data carries an optional legacy `zones` map, and migrate() exists
  // to fold those into slot props. This config uses slots exclusively and
  // never DropZone, so Puck will not emit zones — but silently ignoring a
  // populated one would drop nested content, which is exactly the
  // content-loss failure this repo exists to prevent.
  if (data.zones && Object.keys(data.zones).length > 0) {
    throw new Error(
      'Unexpected legacy `zones` in Puck data — this config uses slots only. Refusing to save rather than risk dropping nested content.',
    );
  }
  return contentToBlocks(data.content as ComponentData[]);
}

function contentToBlocks(content: ComponentData[]): Block[] {
  return content.map((item): Block => {
    // biome-ignore lint/suspicious/noExplicitAny: Puck's ComponentData types don't narrow props here; the switch below does the real narrowing to Block shapes.
    const props = item.props as Record<string, any>;
    switch (item.type) {
      // All four container-shaped components collapse to one stored type.
      // Presets are insert-time scaffolding, not a persisted distinction.
      case 'Container':
      case 'EntryCard':
      case 'BadgeRow':
      case 'MediaGrid':
        return {
          type: 'container',
          children: contentToBlocks((props.children ?? []) as ComponentData[]),
          direction: props.direction,
          gap: props.gap,
          padding: props.padding,
          marginBottom: props.marginBottom,
          align: props.align,
          justify: props.justify,
          columns: props.columns,
          wrap: props.wrap,
          surface: props.surface,
        };
      case 'Heading':
        return { type: 'heading', text: props.text, level: props.level };
      case 'Text':
        return { type: 'text', html: props.html, variant: props.variant };
      case 'Dates':
        return { type: 'dates', text: props.text };
      case 'Bullets':
        return {
          type: 'bullets',
          items: (props.items ?? []).map((i: { text: string }) => i.text),
        };
      case 'Badge':
        return {
          type: 'badge',
          text: props.text,
          accent: props.accent,
          year: props.year || undefined,
        };
      case 'Image':
        return {
          type: 'image',
          src: props.src || undefined,
          alt: props.alt || undefined,
          caption: props.caption || undefined,
        };
      case 'Video':
        return {
          type: 'video',
          mode: props.mode,
          url: props.url || undefined,
          poster: props.poster || undefined,
          caption: props.caption || undefined,
        };
      default:
        throw new Error(`Unknown Puck component type: ${item.type}`);
    }
  });
}
```

- [ ] **Step 4: Update `src/lib/puckAdapter.test.ts`**

Replace the v1 fixture with a nested tree and add the three new tests:

```ts
import { describe, expect, it } from 'vitest';
import { puckConfig } from '../../puck.config';
import type { Block } from '../types';
import {
  blocksToPuckData,
  KNOWN_COMPONENT_NAMES,
  puckDataToBlocks,
} from './puckAdapter';

const container = (children: Block[], over: Partial<Block> = {}): Block =>
  ({
    type: 'container',
    children,
    direction: 'stack',
    gap: 'md',
    padding: 'lg',
    marginBottom: 'lg',
    align: 'baseline',
    justify: 'between',
    columns: 'auto',
    wrap: true,
    surface: 'card',
    ...over,
  }) as Block;

function collectIds(content: { props: { id: string }; [k: string]: unknown }[]): string[] {
  const out: string[] = [];
  for (const item of content) {
    out.push(item.props.id);
    const children = (item.props as { children?: typeof content }).children;
    if (children) out.push(...collectIds(children));
  }
  return out;
}

describe('puckAdapter', () => {
  const blocks: Block[] = [
    container([
      container([
        { type: 'heading', text: 'Acme', level: 'h3' },
        { type: 'dates', text: '2020 – 2021' },
      ]),
      { type: 'text', html: '<p>Engineer</p>', variant: 'subtitle' },
      { type: 'bullets', items: ['<p>Did a thing.</p>', '<p>And another.</p>'] },
      { type: 'badge', text: 'IELTS 8.0', accent: true, year: '2025' },
      { type: 'image', src: 'https://x.example/a.jpg', alt: 'A', caption: 'C' },
      {
        type: 'video',
        mode: 'embed',
        url: 'https://x.example/a.mp4',
        poster: 'https://x.example/p.jpg',
        caption: 'V',
      },
    ]),
  ];

  it('round-trips a nested tree without losing or altering data', () => {
    expect(puckDataToBlocks(blocksToPuckData(blocks))).toEqual(blocks);
  });

  it('gives every node a unique id across the whole tree', () => {
    // The round-trip test cannot catch this: Block carries no id, so a tree
    // with duplicate Puck ids round-trips perfectly while the editor's
    // selection and drag-and-drop misbehave.
    const ids = collectIds(
      blocksToPuckData(blocks).content as never as {
        props: { id: string };
      }[],
    );
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(5);
  });

  it('collapses every container-shaped component to one stored type', () => {
    for (const type of ['Container', 'EntryCard', 'BadgeRow', 'MediaGrid']) {
      const [block] = puckDataToBlocks({
        root: {},
        content: [
          {
            type,
            props: {
              id: 'x',
              children: [],
              direction: 'stack',
              gap: 'md',
              padding: 'none',
              marginBottom: 'none',
              align: 'stretch',
              justify: 'start',
              columns: 'auto',
              wrap: false,
              surface: 'none',
            },
          },
        ],
      } as never);
      expect(block?.type).toBe('container');
    }
  });

  it('refuses data carrying legacy zones rather than dropping their content', () => {
    expect(() =>
      puckDataToBlocks({
        root: {},
        content: [],
        zones: { 'some-id:zone': [] },
      } as never),
    ).toThrow(/zones/i);
  });

  it('recognizes exactly the components configured in puck.config.tsx', () => {
    expect([...KNOWN_COMPONENT_NAMES].sort()).toEqual(
      Object.keys(puckConfig.components).sort(),
    );
  });
});
```

- [ ] **Step 5: Verify the adapter tests**

Run: `npx vitest run src/lib/puckAdapter.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit (will not compile — `actions.ts` and `PuckAdmin.tsx` are still on the old model)**

```bash
git add -A
git commit -m "Rewrite the Puck config and adapter for the generic model"
```

---

### Task 8: Save path and admin shell — the red window closes

**Files:**
- Modify: `app/admin/actions.ts`, `app/admin/actions.test.ts`, `src/components/PuckAdmin.tsx`

**Interfaces:**
- Consumes: `Block`, `Tab`, `PortfolioData`; `sanitizeBlocks` (Task 4); `isOneOf` and the `LAYOUT_*` tuples (Task 1).
- Produces: `saveTabBlocksAction(tabId: string, blocks: Block[]): Promise<void>`.

**Not in this task:** adding, renaming, reordering or deleting tabs. That is phase B (`saveTabsAction` + `TabManager.tsx`). Here the tab bar simply reads whatever tabs the document has.

- [ ] **Step 1: Rewrite the shape guard in `app/admin/actions.ts`**

Delete `REQUIRED_TAB_KEYS`, `isKnownTabKey` and `assertOptionalStringArray` — the last is unused under the new guard (bullets are checked with `isStringArray` plus a per-item length check), and leaving it would fail `npm run lint`. Keep `isStringArray` and `assertOptionalString`. Add the caps and the recursive guard:

```ts
const MAX_DEPTH = 6;
const MAX_NODES = 2000;
const MAX_RICHTEXT_CHARS = 20_000;

function assertRichText(value: unknown, label: string, field: string): void {
  if (typeof value !== 'string') {
    throw new Error(`Invalid content shape: ${label} has a non-string ${field}`);
  }
  if (value.length > MAX_RICHTEXT_CHARS) {
    throw new Error(
      `Invalid content shape: ${label}'s ${field} exceeds ${MAX_RICHTEXT_CHARS} characters`,
    );
  }
}

function assertEnum(
  value: unknown,
  allowed: readonly string[],
  label: string,
  field: string,
): void {
  if (!isOneOf(allowed, value)) {
    throw new Error(
      `Invalid content shape: ${label} has an unknown ${field} "${String(value)}"`,
    );
  }
}

// Recursive. The depth and node caps are new: the whole tree serializes into
// one JSON document under one store key, and deep nesting would blow the
// render stack on the public page. The depth cap is enforced here and only
// here — Puck's slot allow/disallow lists are static component-name lists
// with no notion of how deep a slot already sits, so a depth limit cannot be
// expressed in the editor config. 6 is far above any plausible real layout
// (a job entry needs 3).
function assertBlocksShape(
  data: unknown,
  tabLabel: string,
  path = 'blocks',
  depth = 0,
  counter = { n: 0 },
): asserts data is Block[] {
  if (!Array.isArray(data)) {
    throw new Error(`Invalid content shape: ${tabLabel}.${path} is not an array`);
  }
  if (depth > MAX_DEPTH) {
    throw new Error(
      `Invalid content shape: ${tabLabel}.${path} nests deeper than ${MAX_DEPTH} levels`,
    );
  }
  data.forEach((block, i) => {
    counter.n += 1;
    if (counter.n > MAX_NODES) {
      throw new Error(
        `Invalid content shape: ${tabLabel} has more than ${MAX_NODES} blocks`,
      );
    }
    const label = `${tabLabel}.${path}[${i}]`;
    if (typeof block !== 'object' || block === null) {
      throw new Error(`Invalid content shape: ${label} is not an object`);
    }
    const record = block as Record<string, unknown>;
    switch (record.type) {
      case 'container':
        assertEnum(record.direction, LAYOUT_DIRECTIONS, label, 'direction');
        assertEnum(record.gap, LAYOUT_SPACINGS, label, 'gap');
        assertEnum(record.padding, LAYOUT_SPACINGS, label, 'padding');
        assertEnum(record.marginBottom, LAYOUT_SPACINGS, label, 'marginBottom');
        assertEnum(record.align, LAYOUT_ALIGNS, label, 'align');
        assertEnum(record.justify, LAYOUT_JUSTIFIES, label, 'justify');
        assertEnum(record.columns, LAYOUT_COLUMNS, label, 'columns');
        assertEnum(record.surface, LAYOUT_SURFACES, label, 'surface');
        if (typeof record.wrap !== 'boolean') {
          throw new Error(
            `Invalid content shape: ${label} has a non-boolean wrap`,
          );
        }
        assertBlocksShape(
          record.children,
          tabLabel,
          `${path}[${i}].children`,
          depth + 1,
          counter,
        );
        break;
      case 'heading':
        if (typeof record.text !== 'string') {
          throw new Error(`Invalid content shape: ${label} (heading) missing text`);
        }
        assertEnum(record.level, ['h2', 'h3', 'h4'], label, 'level');
        break;
      case 'text':
        assertRichText(record.html, label, 'html');
        assertEnum(record.variant, ['body', 'subtitle', 'small'], label, 'variant');
        break;
      case 'dates':
        if (typeof record.text !== 'string') {
          throw new Error(`Invalid content shape: ${label} (dates) missing text`);
        }
        break;
      case 'bullets':
        if (!isStringArray(record.items)) {
          throw new Error(
            `Invalid content shape: ${label} (bullets) has a non-string-array items`,
          );
        }
        record.items.forEach((item, ii) =>
          assertRichText(item, `${label}.items[${ii}]`, 'value'),
        );
        break;
      case 'badge':
        if (typeof record.text !== 'string') {
          throw new Error(`Invalid content shape: ${label} (badge) missing text`);
        }
        if (record.accent !== undefined && typeof record.accent !== 'boolean') {
          throw new Error(
            `Invalid content shape: ${label} has a non-boolean accent`,
          );
        }
        assertOptionalString(record.year, label, 'year');
        break;
      case 'image':
        assertOptionalString(record.src, label, 'src');
        assertOptionalString(record.alt, label, 'alt');
        assertOptionalString(record.caption, label, 'caption');
        break;
      case 'video':
        assertEnum(record.mode, VIDEO_MODES, label, 'mode');
        assertOptionalString(record.url, label, 'url');
        assertOptionalString(record.poster, label, 'poster');
        assertOptionalString(record.caption, label, 'caption');
        break;
      default:
        throw new Error(
          `Invalid content shape: ${label} has unknown block type "${String(record.type)}"`,
        );
    }
  });
}
```

- [ ] **Step 2: Rewrite `saveTabBlocksAction`**

```ts
export async function saveTabBlocksAction(
  tabId: string,
  blocks: Block[],
): Promise<void> {
  const session = await auth();
  if (!isAllowedEmail(session?.user?.email, process.env.ALLOWED_EMAILS)) {
    throw new Error('Not authorized.');
  }
  if (typeof tabId !== 'string' || tabId.length === 0) {
    throw new Error('Invalid content shape: missing tab id');
  }
  assertBlocksShape(blocks, `tabs[${tabId}]`);

  const { data: current, etag } = await readPortfolioContentWithEtag();
  // Validated against the FRESHLY READ document, not a static list — and not
  // redundant with the etag check. Two writers now exist: if the tab manager
  // deleted this tab and then a still-mounted Puck editor publishes, this
  // read happens after that delete, the etag matches, and a naive write would
  // silently resurrect the deleted tab.
  const index = current.tabs.findIndex((t) => t.id === tabId);
  if (index === -1) {
    throw new Error('That tab no longer exists. Reload the page.');
  }

  // Sanitize AFTER the shape guard and before the write: the guard rejects,
  // this rewrites. Disallowed markup is stripped rather than failing the
  // save — see src/lib/sanitizeBlocks.ts.
  const tabs = current.tabs.map((tab, i) =>
    i === index ? { ...tab, blocks: sanitizeBlocks(blocks) } : tab,
  );
  const updated: PortfolioData = { ...current, tabs };

  try {
    await savePortfolioContent(updated, { ifMatch: etag });
  } catch (error) {
    if (error instanceof SaveConflictError) {
      throw new Error(
        'Someone else saved changes to this tab while you were editing. Reload the page and reapply your edit.',
      );
    }
    throw error;
  }
}
```

Add the imports: `sanitizeBlocks` from `../../src/lib/sanitizeBlocks`, and `isOneOf`, `LAYOUT_ALIGNS`, `LAYOUT_COLUMNS`, `LAYOUT_DIRECTIONS`, `LAYOUT_JUSTIFIES`, `LAYOUT_SPACINGS`, `LAYOUT_SURFACES`, `VIDEO_MODES` from `../../src/lib/layoutOptions`.

- [ ] **Step 3: Update `PuckAdmin.tsx`**

Delete the `TAB_ORDER` constant. Replace the `activeKey` state and tab bar:

```tsx
const [activeTabId, setActiveTabId] = useState(initialData.tabs[0]?.id ?? '');
const activeTab = initialData.tabs.find((t) => t.id === activeTabId);
```

In `handlePublish`, call `saveTabBlocksAction(activeTabId, blocks)`. Render the tab bar from `initialData.tabs`, keyed and activated by `tab.id`. Guard the editor:

```tsx
{activeTab ? (
  <Puck
    key={activeTab.id}
    config={puckConfig}
    data={blocksToPuckData(activeTab.blocks)}
    onPublish={handlePublish}
    plugins={[aiPlugin]}
    height="calc(100dvh - 3rem)"
  />
) : (
  <div className="wrap">
    <p>This site has no tabs yet.</p>
  </div>
)}
```

Keep every existing comment on `key={activeTab.id}`, the `height` prop and `router.refresh()` — the reasoning behind them is unchanged.

- [ ] **Step 4: Update `app/admin/actions.test.ts`**

Change `fixtureContent()` to the v2 shape and add the new cases:

```ts
function fixtureContent(): PortfolioData {
  return {
    version: 2,
    hero: { name: 'Test', initials: 'T', role: 'Role', profile: 'Profile' },
    tabs: [
      { id: 'teaching', label: 'Teaching', blocks: [] },
      { id: 'media', label: 'Media', blocks: [] },
    ],
    footer: 'Footer',
  };
}

const container = (over: Record<string, unknown> = {}) => ({
  type: 'container',
  children: [],
  direction: 'stack',
  gap: 'md',
  padding: 'none',
  marginBottom: 'none',
  align: 'stretch',
  justify: 'start',
  columns: 'auto',
  wrap: false,
  surface: 'none',
  ...over,
});
```

Keep every existing auth/conflict test, changing `'teaching'` from a key to an id. Add:

```ts
it('rejects a tree nested past the depth cap', async () => {
  let deep = container();
  for (let i = 0; i < 8; i += 1) deep = container({ children: [deep] });
  await expect(
    saveTabBlocksAction('teaching', [deep] as never),
  ).rejects.toThrow(/nests deeper/);
});

it('rejects a tree over the node cap', async () => {
  const many = Array.from({ length: 2001 }, () => container());
  await expect(
    saveTabBlocksAction('teaching', many as never),
  ).rejects.toThrow(/more than 2000/);
});

it('rejects a rich-text value over the length cap', async () => {
  await expect(
    saveTabBlocksAction('teaching', [
      { type: 'text', html: 'x'.repeat(20_001), variant: 'body' },
    ] as never),
  ).rejects.toThrow(/exceeds 20000/);
});

it('rejects a layout value outside the allow-list', async () => {
  await expect(
    saveTabBlocksAction('teaching', [container({ direction: 'flex' })] as never),
  ).rejects.toThrow(/unknown direction/);
});

it('rejects an unknown video mode', async () => {
  await expect(
    saveTabBlocksAction('teaching', [
      { type: 'video', mode: 'autoplay' },
    ] as never),
  ).rejects.toThrow(/unknown mode/);
});

it('rejects a tab id that no longer exists, distinctly from a conflict', async () => {
  await expect(saveTabBlocksAction('deleted-tab', [])).rejects.toThrow(
    /no longer exists/,
  );
});

it('strips disallowed markup instead of failing the save', async () => {
  await saveTabBlocksAction('teaching', [
    { type: 'text', html: '<p>ok<script>bad()</script></p>', variant: 'body' },
  ] as never);
  const saved = vi.mocked(savePortfolioContent).mock.calls[0]?.[0] as PortfolioData;
  expect(JSON.stringify(saved)).not.toContain('script');
  expect(JSON.stringify(saved)).toContain('ok');
});

it('accepts a valid nested tree', async () => {
  await expect(
    saveTabBlocksAction('teaching', [
      container({
        surface: 'card',
        children: [{ type: 'heading', text: 'Acme', level: 'h3' }],
      }),
    ] as never),
  ).resolves.toBeUndefined();
});
```

- [ ] **Step 5: Close the red window — full green gate**

Run: `npm run check` → Expected: **exit 0**. This is the moment the phase becomes coherent again; if anything still fails, fix it here rather than committing.
Run: `npm run test` → Expected: all pass
Run: `npm run lint` → Expected: no diagnostics
Run: `npm run build` → Expected: build succeeds

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Move the save path and admin shell onto the generic model"
```

---

### Task 9: Seed, docs, and end-to-end verification

**Files:**
- Modify: `content/portfolio.json`, `CLAUDE.md`
- Create: `scripts/migrate-seed.mjs` (throwaway, deleted in this task)

**Interfaces:**
- Consumes: `migratePortfolioData` (Task 3).
- Produces: a v2 seed document and accurate project documentation.

- [ ] **Step 1: Generate the v2 seed by running the migration over the v1 file**

Do **not** hand-write it. Per the content-fidelity rule, retyping a real person's CV invites exactly the paraphrasing this project has been bitten by before. Write a throwaway script:

```bash
cat > scripts/migrate-seed.mjs <<'EOF'
import { readFileSync, writeFileSync } from 'node:fs';
import { migratePortfolioData } from '../dist-migrate/contentMigration.js';
const v1 = JSON.parse(readFileSync('content/portfolio.json', 'utf8'));
writeFileSync(
  'content/portfolio.json',
  `${JSON.stringify(migratePortfolioData(v1), null, 2)}\n`,
);
EOF
npx tsc src/lib/contentMigration.ts --outDir dist-migrate --module esnext --target es2022 --moduleResolution bundler
node scripts/migrate-seed.mjs
rm -rf dist-migrate scripts/migrate-seed.mjs
```

If the standalone `tsc` invocation fights the type-only imports, an equally valid route is a one-off Vitest test that writes the file — the requirement is only that the output comes from the migration function, not from a person.

- [ ] **Step 2: Verify the seed round-trips**

Run: `npm run test` → Expected: all pass. `contentMigration.test.ts` reads the frozen fixture, not this file, so it still tests the real v1 → v2 conversion regardless of what the seed now contains.
Run: `npm run build` → Expected: build succeeds (proves `resolveJsonModule` accepts the new shape).

- [ ] **Step 3: Update `CLAUDE.md`**

Two sections are now actively wrong and would mislead the next session:

1. **"Keep `src/types.ts` in sync with `content/portfolio.json`"** — it describes the six-variant union as "a real, deliberate schema". Rewrite it for the generic model: the eight variants, the recursive `container`, the fact that `src/lib/layoutOptions.ts` is the single source of truth that `puck.config.tsx`, `assertBlocksShape` and `Container.tsx` must all read from, that `migratePortfolioData` runs on every read and must stay deterministic, and that `text.html` / `bullets.items` hold sanitized HTML rather than plain text.
2. **The Puck AI guardrail section** — it says "six specific fields/components carry instructions". Update the count and names to match `puck.config.tsx`.

Also add a line to the invariants: **surface and leaf CSS classes carry no outer spacing or padding; the container owns all of it.**

- [ ] **Step 4: Manual verification in the browser**

Start the dev server and check the following. This is the step that catches what unit tests cannot — that the migration produces a page that still looks right.

- The public page renders all seven tabs, and each looks as it did before the migration. The one intended difference: notes and placeholders are left-aligned and non-italic where they used to be centered and italic.
- The media tab still lays out as a grid.
- `/admin` loads, the tab bar lists all seven tabs, and switching tabs loads different content.
- Insert an `EntryCard` — it arrives pre-populated with a title row, subtitle and bullets. Insert a second one; both are independently selectable (this is the path-based-id fix working).
- Bold a phrase inside a bullet, publish, reload — the bold survives.
- Publish a tab and confirm the public page reflects it.

- [ ] **Step 5: Final green gate and commit**

Run: `npm run check && npm run test && npm run lint && npm run build`
Expected: all four pass.

```bash
git add -A
git commit -m "Migrate the seed to v2 and update CLAUDE.md for the generic model"
```

---

## What this phase deliberately leaves undone

- **Adding, renaming, reordering and deleting tabs** — phase B (`saveTabsAction`, `TabManager.tsx`). After phase A the tab list is an array end-to-end, but the only way to change it is editing the store directly, exactly as before.
- **Hero `dob`/`credential` and the About form** — phase C, orthogonal to all of this.
- **Media upload** — `docs/superpowers/specs/2026-08-28-admin-media-upload-design.md`, which depends on this phase and binds to `image.src`, `video.url` and `video.poster`.
