# Design: Grouped job entries, publications, certificate years, and Hero editing

Status: draft, awaiting review
Date: 2026-08-28

## Why

The site owner supplied `Nam.xlsx`, describing content for several tabs that
the current `Block` model (`src/types.ts`) can't represent yet:

- Teaching: "Hanoi Metropolitan University" needs its Featured Modules
  grouped by academic year (AY 2025–26, AY 2026–27), not a flat bullet list.
- International Education: "University of Huddersfield" progressed through
  four sequential role titles over one tenure, each wanting its own
  highlights; British Council's "Programme Coordinator, Education" role
  wants a "Current Projects" list, each project again with its own
  highlights and room to add more later.
- Academic Research (maps to the currently-empty `publications` tab) is a
  Year/Organiser/Role/Published-work/Note record per entry — a shape none
  of the existing block types cover.
- Certificates currently fold the year into the certificate's text string
  (e.g. `"IELTS Academic — Overall 8.0 (2025)"`); the site owner wants it as
  its own field instead.
- The "About" sheet asks for a couple of Hero fields (`dob`, a short
  "MA Education..." credential line) that don't exist on `Hero` yet — and,
  separately, `Hero` currently has **no editing surface in `/admin` at all**
  (`puck.config.tsx` only defines editable components for the 7 tabs'
  block types; name/role/contact info can only be changed by editing the
  content store directly). Adding two more Hero fields without an editing
  path would compound that pre-existing gap, so this spec adds one.

Certificates/Testing/Talks content updates, the ORCID line, and the Gallery
sheet's "photo + video + description" ask are **not** part of this spec:
the first three are content-only (no schema change, just data the site
owner enters later through the admin panel), and Gallery's upload/caption
need is already covered by the separate `feature/admin-media-upload`
branch/spec.

## Scope

- `Job` gains `groups?: { label: string; bullets: string[] }[]`, alongside
  the existing `bullets?: string[]`. Used for Hanoi Metropolitan
  University's module-groups, Huddersfield's role-progression, and British
  Council's project list — each `groups` entry renders as its own labeled
  sub-section under the job.
- A new `Publication` block type, added individually per entry (the same
  "one block = one entry" pattern as `job`/`education`, not bundled into an
  array like `certificate-group`): `{ year, organiser, role, publishedWork,
  note? }`, rendered as a card.
- `Certificate` gains `year?: string`, rendered as a small prefix on the
  certificate tag.
- `Hero` gains `dob?: string` (rendered as another contact-row item) and
  `credential?: string` (a short line under the role).
- A new "About" section in `/admin`, alongside the 7 existing tabs, editing
  `Hero` via a plain form (not Puck — see Architecture) with its own
  `saveHeroAction` server action.

## Architecture

### Content model (`src/types.ts`)

```ts
export interface Job {
  type: 'job';
  company: string;
  dates: string;
  role?: string;
  bullets?: string[];
  groups?: { label: string; bullets: string[] }[];
}

export interface Certificate {
  text: string;
  accent?: boolean;
  year?: string;
}

export interface PublicationBlock {
  type: 'publication';
  year: string;
  organiser: string;
  role: string;
  publishedWork: string;
  note?: string;
}

export type Block =
  | Job
  | PlaceholderEntry
  | Education
  | CertificateGroupBlock
  | GalleryItemBlock
  | NoteBlock
  | PublicationBlock;

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

`bullets` and `groups` on `Job` are independent optional fields, not
mutually exclusive by type — a job can use one or the other in practice
(a flat list of highlights vs. a grouped breakdown), and nothing stops
both being present at once. No validation should force exclusivity;
that's an authoring convention, not a data-integrity rule.

### Rendering

- `JobCard.tsx`: after the existing `bullets` list, render each `groups`
  entry as its own labeled sub-section (a sub-heading from `label`,
  followed by that group's own `<ul>` of bullets) — same visual family as
  the existing bullets list, just repeated once per group with a label.
- New `src/components/PublicationCard.tsx`: a `.block-card` with
  `organiser` as the heading, `role` as the role line, `year` as the dates
  slot, `publishedWork` as the body (styled like `EducationCard`'s
  dissertation line — a distinct, slightly emphasized line), and `note` if
  present as a smaller trailing line.
- `BlockRenderer.tsx` gains `case 'publication': return <PublicationCard pub={block} />;`
  (the exhaustiveness check already in place will fail to compile until
  this case is added, which is the intended guardrail).
- `CertificateGroup.tsx`: when `cert.year` is present, render it as a
  prefix inside the tag (e.g. `<span className="tag-year">{cert.year}</span>`
  before the certificate text), styled subtly smaller/lighter than the
  certificate text itself.
- `Hero.tsx`: add a `dob` `MetaItem` to the existing `meta-row` (alongside
  phone/email/linkedin/location); add a `<p className="credential">` line
  directly under the existing `.role` paragraph when `hero.credential` is
  present.
- `MetaItem.tsx`: add `'calendar'` to its `icon` union with a matching SVG
  path, for the new `dob` item.
- `global.css`: a `.credential` rule (small, `--color-text-inverse`,
  positioned under `.role` — same visual family as the existing hero text,
  reusing the `--sand-*` tokens already in place, not new colors).

### Puck config (`puck.config.tsx`)

- `Job.fields` gains a `groups` field, Puck's `array` field type nested
  inside itself (confirmed supported —
  `https://puckeditor.com/docs/api-reference/fields/array.md`: "Can
  include any field type, including nested array fields"):

  ```tsx
  groups: {
    type: 'array',
    arrayFields: {
      label: { type: 'text' },
      bullets: bulletsField, // the same shared field already used for Job.bullets/Education.bullets
    },
    defaultItemProps: { label: '', bullets: [] },
    getItemSummary: (item: { label: string }) => item.label || 'Group',
  },
  ```

  `Job.defaultProps` gains `groups: []`, and the `render` function passes
  `groups: props.groups.map((g) => ({ label: g.label, bullets: g.bullets.map((b) => b.text) }))`
  through to `JobCard`.
- `CertificateGroup.certificates`'s `arrayFields` gains `year: { type: 'text' }`
  alongside the existing `text`/`accent` fields.
- A new `Publication` component registered in `puckConfig.components`,
  fields `year`/`organiser`/`role`/`publishedWork` as `{ type: 'text' }`
  and `note` as `{ type: 'textarea' }`, `render` passing straight through
  to `PublicationCard`.

### `puckAdapter.ts` and `assertBlocksShape` (`app/admin/actions.ts`)

- `puckTypes.ts`'s `PuckComponentProps` and the adapter's
  `blockToComponentData`/`puckDataToBlocks` both need a `Publication` case
  (mirroring `Job`'s shape) and `Job`'s cases need to carry `groups`
  through in both directions. `KNOWN_COMPONENT_TYPES` in `puckAdapter.ts`
  gains `Publication: true`.
- `assertBlocksShape`'s `'job'` case gains validation for `groups`: if
  present, must be an array of objects each with a string `label` and a
  string-array `bullets` (same nested-validation rigor as the existing
  `bullets`/`certificates` checks — this is exactly the kind of gap a
  recent review found and fixed elsewhere in this codebase, so the new
  field must not reopen it).
- A new `'publication'` case validates `year`/`organiser`/`role`/`publishedWork`
  as required strings and `note` as an optional string
  (`assertOptionalString`, already defined in this file).
- `CertificateGroupBlock`'s certificate-array validation gains a check that
  each certificate's `year`, if present, is a string.

### Hero editing (`/admin`)

Hero doesn't fit Puck's editing model: Puck is built around an ordered,
addable/removable list of content blocks, and Hero is a single fixed-shape
record with no such need (nothing to add, remove, or reorder). Forcing it
into a Puck config would mean a config with exactly one permanently-present
block instance — fighting the tool rather than using it. Instead:

- `src/components/PuckAdmin.tsx`'s tab bar gains an eighth button, "About",
  rendered alongside the 7 tab buttons. `activeKey`'s type becomes
  `keyof PortfolioData['tabs'] | 'about'`. When `activeKey === 'about'`,
  render a new `src/components/HeroForm.tsx` instead of `<Puck>`.
- `HeroForm.tsx` (`'use client'`): a plain HTML form with controlled inputs
  for every `Hero` field (`name`, `initials`, `role`, `phone`, `email`,
  `linkedin`, `location`, `dob`, `credential`, and a `<textarea>` for
  `profile`), a submit handler calling a new `saveHeroAction`, and the same
  toast-driven success/error feedback `PuckAdmin.handlePublish` already
  uses (`toast({ description: 'Saved.' })` / a destructive toast on
  failure), followed by `router.refresh()` on success for the same reason
  `handlePublish` already does it (`initialData` is a server-fetched prop
  that doesn't update itself).
- `app/admin/actions.ts` gains `saveHeroAction(hero: Hero): Promise<void>`,
  mirroring `saveTabBlocksAction`'s structure exactly: the same
  `auth()`/`isAllowedEmail` check, a new `assertHeroShape` guard (`name`/
  `initials`/`role`/`profile` required strings; `phone`/`email`/`linkedin`/
  `location`/`dob`/`credential` optional strings via the existing
  `assertOptionalString`), then `readPortfolioContentWithEtag()` →
  `savePortfolioContent({ ...current, hero }, { ifMatch: etag })` — the
  same optimistic-concurrency protection `saveTabBlocksAction` already has,
  for the same reason (Hero and the 7 tabs all live in one
  `PortfolioData` document, so a concurrent Hero save and tab save are
  exactly the same class of race this codebase already guards against).

### Content fidelity

This spec adds *capability* only — the actual module names, project
highlights, DOB value, and credential text from `Nam.xlsx` are the site
owner's own content, entered through the new admin UI once it exists, not
generated or paraphrased as part of implementing this spec (per this
project's standing content-fidelity rule in `CLAUDE.md`).

## Error handling

- `saveHeroAction` follows the exact same error-handling shape as
  `saveTabBlocksAction`: an unauthorized session gets a plain thrown error
  before any read/write; a shape-guard failure throws before the store is
  touched; a `SaveConflictError` from the store is caught and rethrown as
  a clear "someone else saved changes" message; any other store error
  propagates unchanged. `HeroForm.tsx` surfaces all of these as a
  destructive toast, the same as `PuckAdmin.tsx` already does for tab
  saves.
- A new `Publication` block or a job's `groups` failing `assertBlocksShape`
  behaves exactly like every other shape-guard failure today: the save is
  rejected with a clear message before it reaches the store, so malformed
  data can never reach the public page.

## Testing / verification plan

- Extend `puckAdapter.test.ts`'s round-trip fidelity test with a `Job`
  block that has `groups` set, and a `Publication` block — both directions
  through `blocksToPuckData`/`puckDataToBlocks` must preserve them exactly.
- Extend `app/admin/actions.test.ts` with: a job whose `groups` has a
  non-string-array `bullets` (rejected), a publication missing a required
  field (rejected), a certificate whose `year` is not a string (rejected),
  and a valid job-with-groups / valid publication (accepted).
- New `JobCard.test.tsx` cases (or extend the existing one) for a job
  rendering `groups`, and a new `PublicationCard.test.tsx` for the new
  component.
- New `app/admin/actions.test.ts` (or a new test file) coverage for
  `saveHeroAction`: rejects a non-allow-listed session, rejects a missing
  required field, surfaces a clear conflict message on `SaveConflictError`,
  and succeeds with a valid `Hero`, mirroring `saveTabBlocksAction`'s
  existing test shape exactly.
- Manual verification in a browser: add a job with grouped modules, a
  publication entry, a certificate with a year, and edit Hero's `dob`/
  `credential` through the new "About" section — confirm the public page
  renders all four correctly and the existing 7 tabs are unaffected.

## Open questions for implementation planning (not blocking this spec)

- Exact visual treatment for `Job.groups`' sub-section labels (a bold
  inline label vs. a smaller heading element) — a styling detail to settle
  during implementation, not a structural one.
- Whether `HeroForm.tsx`'s "About" button should be visually distinguished
  from the 7 real tab buttons in `PuckAdmin.tsx` (e.g. a divider or
  different styling) so it doesn't read as an 8th public-facing tab to
  whoever's editing — a small UX detail, not a data-model one.
