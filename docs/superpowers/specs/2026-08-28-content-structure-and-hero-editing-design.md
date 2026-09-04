# Design: Generic content blocks, editable tabs, and Hero editing

Status: draft, awaiting review
Date: 2026-08-28 (rewritten 2026-09-05)

## Why

Two separate problems, one root cause.

**The block model is a closed set of hard-coded shapes.** `src/types.ts`'s
`Block` union has one variant per CV concept — `job`, `placeholder`,
`education`, `certificate-group`, `gallery-item`, `note` — each with fixed
fields. Every time the site owner's content needs a shape those variants
don't cover, it takes a code change across six files (`types.ts`, a
component, `BlockRenderer.tsx`, `puck.config.tsx`, `puckTypes.ts`,
`puckAdapter.ts`, `assertBlocksShape`). Real examples that hit this: modules
grouped by academic year under one employer; a single tenure with four
sequential role titles, each with its own highlights; a project list where
each project has its own sub-bullets; an Academic Research record of
Year/Organiser/Role/Published-work/Note. None of them fit, and each would
have needed its own new block type.

**The tab set is hard-coded in three places.** `PortfolioData['tabs']` is an
object with seven fixed keys, mirrored by a `TAB_ORDER` constant in
`app/page.tsx`, another in `src/components/PuckAdmin.tsx`, and a
`REQUIRED_TAB_KEYS` list in `app/admin/actions.ts`. Adding, removing, or
renaming a section of the site is a code change, not an edit.

The fix for both is the same: move the structure into the content, out of
the type system. The site owner gets a small set of composable primitives
(a layout container, a heading, text, dates, bullets, a badge, an image, a
video) and arranges them freely in tabs they can create, rename, reorder,
and delete from `/admin`.

Separately and unrelatedly, `Hero` has **no editing surface in `/admin` at
all** — `puck.config.tsx` only defines editable components for tab block
content, so name/role/contact info can only be changed by editing the
content store directly. The owner also wants two new Hero fields (`dob`, a
short "MA Education…" credential line). This spec adds both, plus the form
to edit them. That part is orthogonal to the block/tab work and can land
independently.

## The trade-off, stated plainly

Today `Block` is a discriminated union and `BlockRenderer.tsx`'s
`const _exhaustive: never = block` makes a forgotten case a **compile**
error. A generic, recursive model gives some of that up: nesting depth,
layout option values, and total tree size become **runtime** concerns,
enforced by `assertBlocksShape` instead of `tsc`. That is a real loss of
safety, taken deliberately in exchange for the site owner being able to
express new content shapes without a deploy. The mitigations — recursion
with a depth cap, a node-count cap, and layout enums validated against the
same single source of truth the editor's dropdowns are built from — are
specified below and are not optional parts of the change.

## Scope

- `PortfolioData['tabs']` becomes an **ordered array** of tabs with stable
  generated ids; tabs are added, renamed, reordered, and deleted from
  `/admin`.
- `Block` is replaced by eight generic variants: `container`, `heading`,
  `text`, `dates`, `bullets`, `badge`, `image`, `video`. The six existing
  variants are removed.
- `container` holds a slot of child blocks plus constrained layout options
  (direction, gap, padding, margin, align, justify, columns, wrap, surface),
  chosen from dropdowns — never free-form CSS.
- Certificates become the `badge` block (one badge per certificate, laid out
  by a wrapping row container). `badge` carries the `year` field the site
  owner asked for as a first-class field rather than folded into the text.
- Media becomes the `image` and `video` blocks, each with its own `caption`.
  `video` carries an explicit `mode: 'embed' | 'link'` toggle.
- `text` and `bullets` values become **sanitized HTML** rather than plain
  strings, edited through Puck's `richtext` field, so inline bold/italic/
  underline/links are possible for the first time. A new `sanitize-html`
  dependency and a save-time sanitization pass come with that.
- A one-time, on-read content migration converts every stored v1 document
  (and the seed file, and every history snapshot) into the new shape without
  losing a character of content.
- `Hero` gains `dob?` and `credential?`, and a new "About" section in
  `/admin` edits `Hero` through a plain form with its own `saveHeroAction`.
- `CLAUDE.md` is updated in the same change. Its "Keep `src/types.ts` in sync
  with `content/portfolio.json`" section describes the six-variant union as
  "a real, deliberate schema" — this change deletes all six, so that section
  has to describe the generic model, the migration, and the new
  `layoutOptions.ts` invariant instead. Its Puck AI section's "six specific
  fields/components" count changes with the new component set. Leaving either
  stale would hand the next session actively wrong information about the
  schema, which is worse than no documentation.

Certificates/Testing/Talks *content* updates and the ORCID line are not part
of this spec — they are data the site owner enters through the admin panel
once these blocks exist, not schema work.

`PortfolioData.footer` is also **deliberately left out of scope**. It has the
same pre-existing gap this spec closes for `Hero` — a stored string with no
editing surface anywhere — and the About form would be the obvious place to
fix it, but the site owner's call is to leave it for now. Noted here so a
future reader sees a decision rather than an oversight.

## Architecture

### Content model (`src/types.ts`)

```ts
export type LayoutDirection = 'stack' | 'row' | 'grid';
export type LayoutSpacing = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type LayoutJustify = 'start' | 'center' | 'end' | 'between';
export type LayoutColumns = '1' | '2' | '3' | '4' | 'auto';
export type LayoutSurface = 'none' | 'card' | 'dashed';

export interface ContainerBlock {
  type: 'container';
  children: Block[];
  direction: LayoutDirection;
  gap: LayoutSpacing;
  padding: LayoutSpacing;
  marginBottom: LayoutSpacing;
  align: LayoutAlign;
  justify: LayoutJustify;
  columns: LayoutColumns;   // only meaningful when direction === 'grid'
  wrap: boolean;            // only meaningful when direction === 'row'
  surface: LayoutSurface;
}

export interface HeadingBlock {
  type: 'heading';
  text: string;
  level: 'h2' | 'h3' | 'h4';
}

export interface TextBlock {
  type: 'text';
  html: string;   // sanitized HTML, not plain text — see "Rich text"
  variant: 'body' | 'subtitle' | 'small';
}

export interface DatesBlock {
  type: 'dates';
  text: string;
}

export interface BulletsBlock {
  type: 'bullets';
  items: string[];   // sanitized HTML fragments, one per <li>
}

export interface BadgeBlock {
  type: 'badge';
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
  mode: 'embed' | 'link';
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
  id: string;      // crypto.randomUUID() at creation; never derived from the label
  label: string;
  blocks: Block[];
}

export interface PortfolioData {
  version: 2;
  hero: Hero;
  tabs: Tab[];
  footer: string;
}

export interface Hero {
  name: string;
  initials: string;
  role: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  location?: string;
  dob?: string;
  credential?: string;
  profile: string;
}
```

`Tab.id` is a stable generated identifier, deliberately **not** derived from
the label: renaming a tab must not invalidate a save that references it, and
two tabs may legitimately share a label. Nothing in the codebase may
reconstruct an id from a label.

There is no stored `slug`. `app/page.tsx` derives a DOM-friendly slug from
each tab's label at render time (lowercase, non-alphanumerics to `-`),
de-duplicating by appending the tab's index when two labels collide and
falling back to `tab-<index>` for a label that slugifies to an empty string.
This keeps the readable `id="tab-teaching"` anchors the current page has
(and leaves room for real deep-linking later) without storing a second
identifier that can drift from the label.

`ContainerBlock`'s layout fields are all required with concrete defaults
rather than optional, so rendering never has to decide what an absent
`justify` means. `columns` and `wrap` are stored unconditionally but only
consulted for the matching `direction` — simpler than a discriminated layout
union, and a stale `columns` on a `stack` container is inert, not a bug.

Margin is deliberately `marginBottom` only, not a four-sided box. This page
is a single vertical column of stacked blocks; horizontal margin is the
`.wrap` container's job and vertical rhythm between siblings is better
expressed by the parent's `gap` than by each child's own top margin. One
directional margin covers the real need (extra separation after a block)
without four fields to keep consistent. All-sided `padding` stays, because
that one genuinely varies per surface.

**Naming convention.** Types carry the `Block` suffix; components do not.
So `ContainerBlock`/`HeadingBlock`/`TextBlock`/… in `src/types.ts`, and
`Container.tsx`/`Heading.tsx`/`Text.tsx`/… in `src/components/`. This is the
convention the repo already uses (`CertificateGroupBlock` the type vs.
`CertificateGroup` the component) and it matters more now that every block
type has a matching component — without it, `Container.tsx` would import a
type and export a component under the same identifier.

### Rich text (`TextBlock.html` and `BulletsBlock.items`)

Two fields — and only two — hold HTML rather than plain text, so the site
owner can bold a phrase, italicize a title, or link out from inside a
paragraph or a bullet. `HeadingBlock.text`, `DatesBlock.text`,
`BadgeBlock.text`, `ImageBlock.alt` and both `caption`s stay plain strings:
they are short labels where inline markup buys nothing and would only widen
the surface described below.

**What Puck stores.** Puck 0.23's `richtext` field is Tiptap-backed and its
`onUpdate` writes `editor.getHTML()` — verified in the installed
`@puckeditor/core/dist/index.js`. The stored prop value is therefore an
**HTML string**, not a document tree, and Puck's own fallback renderer injects
it with `dangerouslySetInnerHTML`. Everything below follows from that one
fact.

**Editor configuration.** `RichtextField.options` (typed as
`PuckRichTextOptions`) disables individual Tiptap extensions, so the toolbar
is narrowed to what this content actually needs rather than left at Tiptap's
default:

- `TextBlock.html` enables `paragraph`, `bold`, `italic`, `underline`,
  `link`, `hardBreak`. Everything else is `false` — notably `bulletList`,
  `orderedList` and `listItem` (there is a dedicated Bullets block; two ways
  to make a list is a confusion, not a feature), `heading` (there is a
  Heading block), and `blockquote`, `code`, `codeBlock`, `horizontalRule`,
  `strike`.
- `BulletsBlock.items[]` enables `bold`, `italic`, `underline`, `link` only —
  inline marks, no block structure inside a list item.
- `textAlign` is `false` in both, matching the deliberate absence of a
  text-alignment layout option (see Rendering).

Tiptap always wraps content in a block node, so a bullet item's stored value
is `<p>…</p>` even with `paragraph` effectively unused. That `<p>` is
rendered as-is inside the `<li>` and neutralized with
`.block-card li > p { margin: 0 }` — string-surgery to strip the wrapper
would be a fragile HTML parser in the render path for no gain.

**Sanitization is a save-time transform, not a validation.** A new
`src/lib/sanitizeBlocks.ts` walks a `Block[]` tree and returns a new one with
every rich-text value passed through `sanitize-html` (a new dependency;
server-side, no DOM required, which is why it fits in a server action).
`saveTabBlocksAction` calls it *after* `assertBlocksShape` and saves the
sanitized result. Assert and sanitize stay separate functions: one rejects,
one rewrites, and collapsing them would hide the rewrite inside something
named like a check.

The allow-list is deliberately tiny:

| | tags | attributes |
| --- | --- | --- |
| `TextBlock.html` | `p`, `br`, `strong`, `em`, `u`, `a` | `a[href]` |
| `BulletsBlock.items[]` | `p`, `br`, `strong`, `em`, `u`, `a` | `a[href]` |

Everything else is stripped, including every `on*` handler and `style`.
`href` is restricted to `http`, `https` and `mailto`, and `a` tags are given
`rel="noopener"` via `transformTags` — matching the `rel` the existing
`GalleryTile.tsx` already sets on its outbound link.

Sanitizing matters even though only the allow-listed owner can reach the
editor. The public page will render these values with
`dangerouslySetInnerHTML`, and this repo's standing invariant is that the
save-time guard is what makes "malformed data can never reach the public
page" true. Puck AI also writes into these fields, and the content store can
be written to by hand. Sanitizing at the save boundary means the stored
document is safe *by construction*, so the render-time injection rests on an
enforced invariant rather than on trust. `Text.tsx` and `Bullets.tsx` are the
first components in this repo to use `dangerouslySetInnerHTML` on stored
content — their `biome-ignore` comments must say exactly that, rather than
copying the existing "hardcoded constant SVG, never user input" wording,
which would be false here.

A per-field length cap (20,000 characters) is checked in `assertBlocksShape`
alongside the node and depth caps: HTML balloons faster than plain text, and
the whole tree is one JSON document in one store key.

**Migration must escape.** v1 values are plain strings and become HTML, so
`migratePortfolioData` HTML-escapes `&`, `<` and `>` in every string it moves
into a rich-text field, and wraps `TextBlock.html` values in `<p>…</p>`.
Without this, a bullet reading `R&D` or `5 < 10` would be silently mangled —
a content-fidelity failure of exactly the kind this project guards against.
(The current `content/portfolio.json` happens to contain none of these three
characters, so this is about the content that comes later, not the content
that exists.) This also affects the flagship migration test: it must escape
each v1 string before searching for it in the v2 tree, or it will fail
confusingly on the first `&` the owner ever types.

**Styling.** `global.css` gains rules for `strong`/`em`/`u`/`a` inside
`.text-body`/`.text-small`/`.text-subtitle` and inside `.block-card li`. The
existing `.block-card li b` rule stays but is joined by `strong` (Tiptap
emits `<strong>`, not `<b>`) — that rule has had nothing producing it until
now. Link color reuses `--color-accent-default`, per the fixed-palette rule.

### Layout options: one source of truth (`src/lib/layoutOptions.ts`)

A new module exports each option list once:

```ts
export const LAYOUT_DIRECTIONS = ['stack', 'row', 'grid'] as const;
export const LAYOUT_SPACINGS = ['none', 'xs', 'sm', 'md', 'lg', 'xl'] as const;
// …align, justify, columns, surface
```

Three consumers read from it and must never keep their own copy:

1. `puck.config.tsx`'s `select` field `options` arrays (label/value pairs
   built from these constants).
2. `assertBlocksShape`'s allow-list checks in `app/admin/actions.ts`.
3. `src/components/Container.tsx`'s className mapping.

Three hand-maintained copies of the same enum would drift silently — a value
the editor offers but the shape guard rejects is a save that fails with a
confusing error; a value the guard accepts but the CSS has no rule for is a
block that renders unstyled. One module, three importers.

### Rendering

Layout is applied as **composed class names**, never as inline style strings
built from stored values. `Container.tsx` maps
`direction`/`gap`/`padding`/`marginBottom`/`align`/`justify`/`columns`/`wrap`/`surface`
onto `layout-dir-row`, `layout-gap-md`, `layout-surface-card` and so on, and
`src/styles/global.css` defines one rule per class against the existing
`--spacing-*` tokens. Two reasons: CLAUDE.md's one-global-stylesheet rule,
and the fact that a stored value can then never become arbitrary CSS even if
it somehow got past the shape guard.

New/changed components in `src/components/`:

- `Container.tsx` — the only structural component. Renders a `<div>`
  with the composed layout classes and its children through `BlockRenderer`.
  `surface: 'card'` applies the existing `.block-card` look, `'dashed'` the
  existing `.placeholder.card` look (dashed outline, left-aligned, normal
  weight), `'none'` no surface.

  **The centered-italic `.placeholder` variant is dropped.** Today
  `.placeholder` is centered and italic while `.placeholder.card` is
  left-aligned and normal; after this change there is one dashed treatment,
  the left-aligned one, and the `text-align: center` / `font-style: italic`
  declarations are deleted from `global.css`. Consequently there is
  deliberately **no `textAlign` layout option** on the container: the
  container's `align`/`justify` are flex properties governing child boxes,
  not text, and nothing in this content needs centered prose. Adding
  `textAlign` later is a one-line addition to `layoutOptions.ts` if that ever
  changes.
- `Heading.tsx` — `<h2>`/`<h3>`/`<h4>` per `level`, reusing the existing
  `.block-card h3` typography (promoted to a standalone `.block-heading`
  class so it no longer depends on being inside a card).
- `Text.tsx` — a `<div>` carrying `.text-body` / `.text-subtitle` /
  `.text-small` and rendering `html` through `dangerouslySetInnerHTML` (a
  `<div>`, not a `<p>`, because the sanitized value contains its own block
  tags). `subtitle` carries the existing `.role` treatment (uppercase,
  letter-spaced, 600 weight). Per CLAUDE.md, these variants differ by size
  and weight only — no variant introduces a lighter shade of the palette.
- `Dates.tsx` — the existing `.dates` treatment.
- `Bullets.tsx` — the existing `<ul>`/`<li>` treatment, each `<li>`
  rendering its item through `dangerouslySetInnerHTML`.
- `Badge.tsx` — the existing `.tag` / `.tag.accent` treatment, with
  `year` rendered as a subtly smaller prefix inside the tag when present.
- `Image.tsx` / `Video.tsx` — replace `GalleryTile.tsx`. Each keeps
  that component's existing safety behavior: `isSafeHttpUrl` gating on any
  URL before it becomes an `href`/`src`, and the placeholder-tile empty state
  when no media is set yet. `caption` renders as a line beneath.
  `Video.tsx` branches on `mode`: `'link'` reproduces `GalleryTile`'s current
  behavior exactly (a poster or icon tile that opens the URL in a new tab
  with `rel="noopener"`), `'embed'` renders
  `<video controls preload="metadata" poster={poster}>`. The toggle is
  explicit rather than sniffed from the URL because the two cases are not
  reliably distinguishable — an R2 object URL need not end in `.mp4`, and a
  YouTube watch URL will never play in a `<video>` element. The field's Puck
  label says so ("Embed plays a direct video file; use Link for YouTube,
  Vimeo, or any page URL"). Default is `'link'`, which is what every existing
  video already is.
- `BlockRenderer.tsx` — gains a `container` case that recurses. Its `never`
  exhaustiveness check stays and still covers the (now generic) variant list.

Deleted: `JobCard.tsx`, `EducationCard.tsx`, `PlaceholderCard.tsx`,
`CertificateGroup.tsx`, `GalleryTile.tsx`, `Note.tsx`, and their tests. The
CSS classes they used are kept and reused by the new components, so this is
a markup/model change, not a visual redesign.

`app/page.tsx` loses its `TAB_ORDER` constant and its
`wrapperClassName: t.key === 'media' ? 'gallery-grid'` special case — with
arbitrary tabs there is no "the media tab" to special-case. The grid layout
that class provided is now expressible by the site owner directly: a
container with `direction: 'grid'`, `columns: 'auto'`. The migration wraps
the existing media tab's blocks in exactly that container so the page looks
unchanged.

**Spacing ownership.** `.block-card` currently bakes in
`margin-bottom: var(--spacing-lg)` and `.tag-row` bakes in
`margin-top: var(--spacing-md)`. Once a container owns `gap` and
`marginBottom`, those built-in margins double up. The rule for this change:
**surface and leaf classes carry no outer spacing; the container owns all of
it.** `.block-card`'s `margin-bottom` moves out into `layout-mb-*`, and
`.tag-row`'s `margin-top` disappears in favour of the parent container's
`gap`. This is precisely the kind of collision CLAUDE.md warns about, so it
is settled here rather than discovered during implementation.

### Puck config (`puck.config.tsx`)

Each block type maps to a Puck component. `container` uses Puck's `slot`
field type for its children — verified against the installed
`@puckeditor/core@0.23.0`'s own type definitions (`SlotField` in
`dist/actions-DA1J5F56.d.ts`), and type-checked end to end with a throwaway
`tsc` spike covering all three things the adapter depends on: a `Slot`-typed
prop inside `Config<PuckComponentProps>`, a `render` that receives the slot
as a component (`({ children: Children }) => <Children />`), and a
`Data<PuckComponentProps>` literal with nested children inline under
`props.children`. All three type-check clean.

```tsx
Container: {
  fields: {
    children: { type: 'slot' },
    direction: { type: 'select', options: /* from layoutOptions */ },
    gap: { type: 'select', options: /* … */ },
    // padding, marginBottom, align, justify, columns, surface
    wrap: { type: 'radio', options: [ /* On / Off */ ] },
  },
  defaultProps: { children: [], direction: 'stack', gap: 'md', /* … */ },
  render: ({ children: Children, ...layout }) => (
    <Container {...layout}><Children /></Container>
  ),
}
```

**Insert-time presets, to keep editing cheap.** Composing a job entry out of
a container plus four children is more drags than the old single `Job` block
with four fields. The fix is preset components: `puckConfig.components`
registers `EntryCard`, `BadgeRow`, and `MediaGrid` alongside the plain
`Container`, differing *only* in `defaultProps` — `EntryCard` drops in
pre-seeded with a title row (heading + dates), a subtitle text, and an empty
bullets list; `BadgeRow` with `direction: 'row', wrap: true`; `MediaGrid`
with `direction: 'grid', columns: 'auto'`. (Pre-seeding slot children through
`defaultProps` is part of the same verified spike above. The ids written into
those pre-seeded children are placeholders and don't need to be unique:
Puck's `insertAction` runs `populateIds` over the whole `defaultProps` tree
and `walkTree` regenerates a fresh `${type}-${uuid}` id for every slot child
on insert — verified in the installed
`@puckeditor/core/dist/index.js` — so inserting the same preset twice can't
collide.) All four collapse
to the same stored `{ type: 'container' }` in `puckDataToBlocks` — the
adapter only has to be 1:1 on the way *out*, and it already is the
translation layer. Presets are insert-time scaffolding, not a persisted
distinction: an `EntryCard` reopens in the editor as a `Container`, which is
lossless in content and only mildly lossy in editor labelling.

The existing shared `bulletsField` stays an `array` field but its
`arrayFields.text` changes from `textarea` to `richtext` with the inline-only
options listed under Rich text; `Text.html` becomes a `richtext` field with
the block-level options. Keeping bullets an array of richtext values rather
than one richtext field containing a `<ul>` preserves Puck's per-item
reorder/duplicate UI and, more importantly, keeps the per-bullet AI
instruction meaningful — "never rewrite an existing bullet" is enforceable
against an array of items in a way it is not against one opaque HTML blob.

`ai.instructions` carry over from the current config to the new components,
against the same content-fidelity concern: `heading`, `text`, `dates`,
`bullets` and `badge` each get an instruction of the form "only add new
items; never edit or rewrite the text of an existing one". The
handler-level `ai.context` and `ai.mode: 'assembly'` in
`app/api/puck/[...all]/route.ts` are unchanged and still apply.

### `puckAdapter.ts` and `puckTypes.ts`

`blockToComponentData` and `puckDataToBlocks` become mutually recursive
through the container case: a container's `children` map to `props.children`,
which is `ComponentData[]` — the same `Content<Components>` shape as
top-level `data.content`, so one pair of functions handles every depth.

**Ids must become path-based.** `blocksToPuckData` currently generates
`${block.type}-${i}`, which is only unique within one flat list — with
recursion, a top-level container and a child container both become
`container-0`, and Puck requires ids unique across the whole tree for
selection and drag-and-drop to work. The scheme becomes
`${parentId}-${block.type}-${i}`, with the top level using just
`${block.type}-${i}`. This needs its own test, because the round-trip
fidelity test cannot catch it: that test compares `Block[]` before and
after, and `Block` carries no id, so a tree with duplicate Puck ids
round-trips perfectly while the editor misbehaves.

One defensive check is new. Puck's `Data` type has an optional legacy
`zones?: Record<string, Content>` map (confirmed in the installed SDK, along
with the `migrate()` helper that exists to fold legacy dynamic zones into
slot props). This config uses slots exclusively and never `DropZone`, so Puck
will not emit `zones` — but a props-only `puckDataToBlocks` would silently
drop nested content if it ever did, which is exactly the content-loss class
of failure this repo is built to prevent. So `puckDataToBlocks` throws if
`data.zones` has any entries, rather than quietly ignoring it.

`PuckComponentProps` in `puckTypes.ts` is rewritten for the new components,
with `Container`/`EntryCard`/`BadgeRow`/`MediaGrid` all typed
`{ children: Slot; direction: LayoutDirection; … }`, importing the layout
types from `src/types.ts` so the editor's prop shape and the stored shape
cannot drift. `KNOWN_COMPONENT_TYPES` in `puckAdapter.ts` is updated to the
new component names, including the three presets — its
`Record<keyof PuckComponentProps, true>` typing keeps that list honest
automatically.

### Shape guard (`app/admin/actions.ts`)

`assertBlocksShape` becomes recursive, and gains three limits it does not
have today:

- **Depth cap of 6.** Prevents a pathologically nested tree from blowing the
  render stack on the public page. This is enforced **at save time only**,
  and that is a decision rather than an oversight: Puck's `SlotField` offers
  `allow`/`disallow`, but both are static lists of component *names* with no
  notion of how deep the slot already sits, so a depth limit simply cannot be
  expressed in the editor config. The cap is therefore set well above any
  plausible real layout (a job entry needs 3) so that hitting it means
  something has gone wrong, not that the owner ran out of room mid-edit.
- **Total node cap of 2000** across the tab's whole tree. The document is a
  single JSON blob under one store key; an unbounded tree is an unbounded
  write.
- **Layout enum allow-lists**, checked against the `layoutOptions.ts`
  constants — every one of `direction`/`gap`/`padding`/`marginBottom`/
  `align`/`justify`/`columns`/`surface` must be a member of its list, and
  `wrap` must be a boolean.

Per-variant checks follow the existing style exactly: required strings
checked with `typeof`, optional ones through the existing
`assertOptionalString`, `bullets.items` through `isStringArray`,
`badge.accent` as an optional boolean, `video.mode` against its two allowed
values. `container.children` recurses. Rich-text fields are checked as
strings here and additionally against the 20,000-character cap; their
*content* is not validated by this guard but rewritten by the separate
sanitization pass described under Rich text, which `saveTabBlocksAction`
runs after this one and before the write.

`REQUIRED_TAB_KEYS` and `isKnownTabKey` are deleted — with tabs stored as an
array there is no static key list to validate against. `saveTabBlocksAction`
takes a `tabId: string` and validates it against the **freshly read**
document, inside the read-modify-write:

```ts
const { data: current, etag } = await readPortfolioContentWithEtag();
const index = current.tabs.findIndex((t) => t.id === tabId);
if (index === -1) throw new Error('That tab no longer exists. Reload the page.');
```

This is not redundant with the etag check. Two writers now genuinely exist:
if the owner deletes a tab in the tab manager, then publishes a Puck editor
that was still mounted on that tab, the block save re-reads *after* the
delete landed — the etag matches, and a naive spread would silently
resurrect the deleted tab. Validating the id against the just-read document
is what catches it.

### Tab management

A new `saveTabsAction(metas: { id: string; label: string }[]): Promise<void>`
handles add, rename, reorder, and delete in one write — the tab manager UI
edits the whole list and publishes once, so one action with one shape guard
and one etag-protected write is simpler and more atomic than four granular
actions racing each other.

Its reconciliation against the freshly-read document:

- A meta whose `id` matches an existing tab → that tab keeps its `blocks`,
  takes the new `label`, and moves to the meta's position in the array.
- A meta whose `id` matches nothing → a new tab with `blocks: []`. The id is
  generated **client-side** at add time (`crypto.randomUUID()`) so the UI can
  key the row before the save round-trips.
- An existing tab with no meta → deleted, blocks and all.

Validation before any write: `metas` is an array; every entry has a string
`id` and a non-empty string `label`; ids are unique; the list length is
capped (20 tabs) as the same class of bound as the node cap above.

Deleting a tab discards its content, so the UI requires an explicit confirm
naming the tab. The recovery path is the one this repo already has: every
save writes a timestamped `history/<ISO>.json` snapshot, so a mistaken
delete is recoverable from the store by hand.

`src/components/TabManager.tsx` (`'use client'`) renders the editable list —
a text input per tab, up/down reorder buttons, a delete button with confirm,
an "Add tab" button — and a Publish button calling `saveTabsAction`, with the
same toast + `router.refresh()` feedback `handlePublish` already uses.

`PuckAdmin.tsx` builds its tab bar from `initialData.tabs` instead of the
static `TAB_ORDER`, keys `<Puck>` by `activeTabId`, and gains two sections
beside the content tabs: "About" (the Hero form) and "Tabs" (the manager).
Both are visually separated from the content-tab buttons so they don't read
as public-facing sections. `activeKey`'s type becomes
`string | 'about' | 'tabs'`. When the tab list is empty, the editor area
renders an empty state pointing at the tab manager rather than mounting
`<Puck>` on nothing.

### Migration (`src/lib/contentMigration.ts`)

The store already holds a v1 document, `content/portfolio.json` is v1, and
every `history/` snapshot is v1. A new pure function
`migratePortfolioData(raw: unknown): PortfolioData` runs **on read** — inside
`readPortfolioContentStrict`, `readPortfolioContentWithEtag`, and over the
imported seed — so every consumer sees v2 regardless of what is stored.
Migrate-on-read rather than a one-off script because the production content
lives in Netlify Blobs with no convenient script access, and because it
covers history snapshots for free.

It is idempotent: `version === 2` returns the input untouched. A v1 document
is detected by `tabs` being a non-array object, and converted:

| v1 block | v2 result |
| --- | --- |
| `job` | container(surface: card) → [ container(row, justify: between, wrap) → [heading(company), dates(dates)], text(role, subtitle), bullets(bullets) ] |
| `education` | container(surface: card) → [ container(row, justify: between, wrap) → [heading(school), dates(dates)], text(degree, subtitle), bullets(bullets), text(dissertation, small) ] |
| `placeholder` | container(surface: dashed) → [heading(company), text(note, body)] |
| `certificate-group` | container(surface: card) → [heading(heading), container(row, wrap) → badge per certificate] |
| `gallery-item` (photo) | image(src: image) |
| `gallery-item` (video) | video(mode: link, url: videoUrl, poster: image) |
| `note` | container(surface: dashed) → [text(text, body)] |

Every string moved into a `text` or `bullets` field is HTML-escaped first,
and `text` values are wrapped in `<p>…</p>` — see "Migration must escape"
under Rich text. Notes lose their centered-italic treatment in the process
(see Rendering); that is the one intentional visual difference the migration
produces.

Empty optional fields produce no child rather than an empty one — a job with
no `role` yields no subtitle block. The seven tab keys become seven array
entries in their current order, keeping their existing `label`; the `media`
tab's blocks are additionally wrapped in a `container(grid, columns: auto)`
to preserve the `.gallery-grid` look the removed `wrapperClassName` special
case provided.

**`migratePortfolioData` must be deterministic — it may not call
`randomUUID()`.** A migrated tab takes its v1 object key verbatim as its id
(`'teaching'`, `'internationalEducation'`, …). This is not cosmetic. The
migration runs on *every* read of a still-v1 document, so a random id would
differ between the read that rendered the admin page and the read inside
`saveTabBlocksAction`'s read-modify-write — and that action looks the tab up
by id in the freshly-read document, so every save against a not-yet-migrated
document would fail with "that tab no longer exists". Deterministic ids make
migrate-on-read idempotent in the only sense that matters here: the same
stored bytes always produce the same ids. `randomUUID()` is correct for tabs
the owner *creates* (in `TabManager`, where the id is persisted immediately),
and wrong inside the migration. Reusing the v1 key also means the id is
readable, which is a small bonus for debugging.

`content/portfolio.json` is also rewritten by hand into the v2 shape in the
same change, so a from-scratch deploy starts from v2 directly. Per CLAUDE.md's
content-fidelity rule, that rewrite moves the existing strings verbatim — no
rewording, no summarizing, no invented text. The most reliable way to produce
it is to run the migration function over the current file and write its
output, rather than retyping anything.

### Hero editing (`/admin`)

Hero doesn't fit Puck's editing model: Puck is built around an ordered,
addable/removable list of blocks, and Hero is a single fixed-shape record
with nothing to add, remove, or reorder. Forcing it in would mean a config
with exactly one permanently-present block instance — fighting the tool
rather than using it. Instead:

- `src/components/HeroForm.tsx` (`'use client'`): a plain HTML form with
  controlled inputs for every `Hero` field (`name`, `initials`, `role`,
  `phone`, `email`, `linkedin`, `location`, `dob`, `credential`, and a
  `<textarea>` for `profile`), a submit handler calling `saveHeroAction`, and
  the same toast feedback plus `router.refresh()` on success that
  `PuckAdmin.handlePublish` already uses (`initialData` is a server-fetched
  prop that doesn't update itself).
- `app/admin/actions.ts` gains `saveHeroAction(hero: Hero): Promise<void>`,
  mirroring `saveTabBlocksAction`'s structure exactly: the same `auth()` /
  `isAllowedEmail` check, a new `assertHeroShape` guard
  (`name`/`initials`/`role`/`profile` required strings;
  `phone`/`email`/`linkedin`/`location`/`dob`/`credential` optional strings
  via the existing `assertOptionalString`), then
  `readPortfolioContentWithEtag()` →
  `savePortfolioContent({ ...current, hero }, { ifMatch: etag })` — the same
  optimistic-concurrency protection, for the same reason (Hero and every tab
  live in one `PortfolioData` document, so a concurrent Hero save and tab
  save are the same class of race).
- `Hero.tsx` renders `dob` as another `MetaItem` in the existing `.meta-row`,
  and `credential` as a `<p className="credential">` directly under `.role`.
  `MetaItem.tsx` gains `'calendar'` to its `icon` union with a matching SVG
  path. `global.css` gains a `.credential` rule sized and weighted to sit
  under `.role`, reusing existing tokens.

### Content fidelity

This spec adds *capability* only. Every real string — module names, project
highlights, the DOB value, the credential line — is the site owner's own
content, entered through the admin panel or carried across verbatim by the
migration. Nothing in implementing this spec generates or paraphrases CV
copy, per CLAUDE.md's standing rule.

## Relationship to the media-upload spec

`docs/superpowers/specs/2026-08-28-admin-media-upload-design.md` has been
revised alongside this one and now depends on it: it should land after this
spec's phase A. Its R2 bucket, `app/api/upload/route.ts` route handler,
auth gate, streamed progress protocol, and custom upload-or-paste Puck field
all stand unchanged — they now bind to this spec's `image.src`, `video.url`,
and `video.poster` fields instead of the removed
`GalleryItem.image` / `GalleryItem.videoUrl`. That spec's separate `caption`
addition is subsumed: `image` and `video` both carry `caption` here, so
nothing about captions is left for it to add.

## Error handling

- Every new save path (`saveTabBlocksAction` with a `tabId`, `saveTabsAction`,
  `saveHeroAction`) follows the established shape: unauthorized session →
  thrown error before any read or write; shape-guard failure → thrown before
  the store is touched; `SaveConflictError` → caught and rethrown as a clear
  "someone else saved changes" message; any other store error propagates
  unchanged. The admin UI surfaces all of them as a destructive toast.
- A save referencing a tab id that no longer exists gets its own distinct
  message ("that tab no longer exists") rather than being folded into the
  conflict message — different cause, different remedy.
- A block tree exceeding the depth, node, or rich-text length cap, or
  carrying a layout value or a `video.mode` outside its allow-list, is
  rejected at save time with a message naming the offending path, exactly
  like every existing shape-guard failure. Malformed data cannot reach the
  public page.
- Disallowed markup in a rich-text field is **not** an error: it is silently
  stripped by the sanitization pass and the save proceeds. This is the one
  place the save path rewrites rather than rejects, and it is the right
  behavior — a paste from Word carrying `<span style>` should lose the span,
  not fail the save. The distinction is worth remembering when debugging
  "why did my formatting disappear": the answer is the allow-list, not a bug.
- A stored document that `migratePortfolioData` cannot recognize (neither v2
  nor a v1-shaped object) throws from the strict read — which
  `getPortfolioContent` catches and degrades to seed content for the public
  page, and which `readPortfolioContentWithEtag` deliberately lets propagate,
  so a save never overwrites an unrecognized document with a guess.

## Implementation phases

**Steps 1–3 are one atomic change and cannot land separately.** Replacing
`Block` in `src/types.ts` immediately breaks `BlockRenderer.tsx`'s exhaustive
switch, `puckAdapter.ts`'s twelve variant references, `puck.config.tsx`'s
component map, and `assertBlocksShape` — sixteen files import from
`src/types.ts` and four hard-reference the old variant names. There is no
ordering of these three steps that leaves `npm run check` passing in between,
so they are steps within one phase, not phases. Only the boundaries *after*
step 3 are real.

Phase A — the content model (steps 1–3 together, one green checkpoint at the
end):

1. **Model + migration.** New `types.ts`, `layoutOptions.ts`,
   `contentMigration.ts`, seed file rewritten, and CLAUDE.md's
   `types.ts`-sync section rewritten for the generic model.
2. **Public rendering.** New block components, `BlockRenderer` recursion,
   `app/page.tsx` tab derivation, the CSS layout classes, the rich-text
   inline styles, the dropped centered-italic placeholder rules, and the
   spacing ownership fix. Old components deleted here.
3. **Editor plumbing.** `puck.config.tsx` (including the three presets and
   the two `richtext` field configurations), `puckTypes.ts`,
   `puckAdapter.ts` recursion, path-based ids and the `zones` guard,
   `assertBlocksShape` recursion and caps, `sanitizeBlocks.ts` and its wiring
   into `saveTabBlocksAction`, and CLAUDE.md's Puck AI guardrail section
   updated for the new field/component set.

Within phase A the tests are the safe ordering device rather than the build:
`contentMigration.test.ts` and `sanitizeBlocks.test.ts` are both pure-function
tests with no dependency on the components or the editor, so they can be
written and passing before any component is touched, and they cover the two
places where a mistake is silent rather than loud.

Phase B — **dynamic tabs.** `saveTabsAction`, `TabManager.tsx`,
`PuckAdmin.tsx`'s dynamic tab bar and `tabId`-based saves. Depends on phase
A only for `Tab.id` existing in the model; everything else here is additive.

Phase C — **Hero.** `dob`/`credential`, `HeroForm.tsx`, `saveHeroAction`,
`MetaItem`'s calendar icon, `.credential` CSS. Fully orthogonal to A and B —
it touches `Hero`, never `Block` or `Tab` — so it can land at any point,
including first, and is the natural choice for a small independent slice.

## Testing / verification plan

- **`src/lib/contentMigration.test.ts` — "migrating the real seed loses no
  content"**: run `migratePortfolioData` over the actual
  `content/portfolio.json` (as it was before phase A rewrote it, kept as a
  test fixture) and assert that every string value reachable in the v1
  document appears somewhere in the v2 tree. This is the single most
  important test in the change: it is what makes "no character of content is
  lost" a checked claim rather than an intention. Plus: idempotence
  (migrating a v2 document returns it unchanged), **determinism** (migrating
  the same v1 document twice produces deeply equal output, tab ids included —
  the guard against the save-breaking failure described above), **escaping**
  (a v1 string containing `&`, `<` and `>` survives as visible text, not
  markup), and one focused case per row of the mapping table. Note the
  no-content-lost test must escape each v1 string before searching for it, or
  it will fail on the first `&` the owner ever types.
- **`src/lib/puckAdapter.test.ts`**: extend the round-trip fidelity test with
  a nested container tree (container → container → leaves) and assert
  `puckDataToBlocks(blocksToPuckData(blocks))` is deeply equal to `blocks` at
  every depth. Add: every id in the `Data` produced from a nested tree is
  unique across the whole tree (the path-based-id guard — the round-trip test
  cannot catch this, see above); all four container-shaped Puck components
  (`Container`, `EntryCard`, `BadgeRow`, `MediaGrid`) collapse to
  `{ type: 'container' }`; a `data.zones` with entries throws. Keep the
  existing component-name-parity test, updated to the new names.
- **`src/lib/sanitizeBlocks.test.ts`**: a `<script>` tag, an `onerror`
  attribute, a `javascript:` href, a `style` attribute and an unknown tag are
  each stripped; `strong`/`em`/`u`/`a[href]` survive; an `a` comes out with
  `rel="noopener"`; nested containers are sanitized at every depth; plain
  fields (`heading.text`, `badge.text`, captions) are returned untouched.
  These are the tests that justify the `dangerouslySetInnerHTML` on the
  public page, so they carry more weight than their size suggests.
- **`app/admin/actions.test.ts`**: a container nested past the depth cap
  (rejected), a tree over the node cap (rejected), a rich-text value over the
  length cap (rejected), a container with a `direction` outside the
  allow-list (rejected), a `video.mode` outside its two values (rejected), a
  valid nested tree (accepted), and a save whose rich text contains a
  `<script>` succeeding with the script stripped from what reaches the store.
  For `saveTabsAction`: duplicate ids rejected, an empty label
  rejected, over the tab cap rejected, a rename preserving that tab's blocks,
  a delete removing them, a reorder changing only order. For
  `saveTabBlocksAction`: an unknown `tabId` rejected with the distinct "no
  longer exists" message. For `saveHeroAction`: non-allow-listed session
  rejected, missing required field rejected, `SaveConflictError` surfaced as
  the clear conflict message, valid Hero accepted.
- **Component tests**: `Container.test.tsx` (layout values produce the
  expected class names; children render through `BlockRenderer`),
  `Badge.test.tsx` (year prefix, accent variant),
  `Text`/`Bullets` (allowed markup renders as elements; an escaped `&lt;`
  renders as visible text, not a tag), `Image`/`Video` (an unsafe URL is not
  rendered as an `href`/`src`, empty state, caption, and `mode` selecting the
  `<video>` element vs. the link tile). `BlockRenderer.test.tsx` extended for
  recursion. `TabbedContent.test.tsx` extended for the derived-slug behavior
  including the duplicate-label and empty-slug cases.
- **Manual verification in a browser**: add a tab, rename it, reorder it,
  delete it; build a job-style entry from an `EntryCard` preset and confirm it
  renders identically to the old `JobCard` output; bold a phrase inside a
  bullet and confirm it survives a publish and a reload; add badges in a
  wrapping row; add an image, an embedded video and a linked video with
  captions; edit Hero's `dob` and `credential` through the About section.
  Then compare the public page against a pre-migration screenshot — after the
  migration and before any new editing, the only intended difference is the
  notes' lost centered-italic styling.
