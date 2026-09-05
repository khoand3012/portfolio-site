# CLAUDE.md

Guidance for working in this repo. See `README.md` for the human-facing
overview; this file is about conventions and invariants to preserve.

## What this is

A real person's CV/portfolio site (Truong Nam Nguyen). Content accuracy
matters — names, dates, job titles, and bullet points are factual claims
about someone's career, not filler copy.

## The one invariant: content lives in Netlify Blobs, not in git

This is a [Next.js](https://nextjs.org) 15 (App Router) site, deployed via
`@netlify/plugin-nextjs` (see `netlify.toml`'s `[[plugins]]` entry — there's
no `publish` dir because this is server rendering, not a static export;
`next.config.js` has no `output: 'export'`). `npm run build` runs
`next build`.

**The running site does not read `content/portfolio.json` directly.** Page
content lives in a Netlify Blobs store, written and read through
`src/lib/blobStore.ts` / `src/lib/portfolioContent.ts`: every save writes a
`current.json` key plus a timestamped `history/<ISO-timestamp>.json`
snapshot (a manual-recovery safety net — nothing currently lists or
restores old snapshots, but they exist on disk/in the store). `app/page.tsx`
is `export const dynamic = 'force-dynamic'` specifically so it reads that
live content on every request instead of being statically prerendered —
removing that would silently make saved admin edits stop reaching the
public page again (this was a real bug, fixed mid-migration).

`content/portfolio.json` is only the **seed**: `getPortfolioContent()`
reads it solely when `current.json` doesn't exist yet (a fresh deploy
nothing has ever been saved through) or if a store read fails outright. Once
anything has been saved via `/admin`, hand-editing the JSON file has **no
effect on the deployed site** — it only changes the seed a hypothetical
from-scratch deploy would start from.

Local dev (`next dev`) has no Netlify Blobs credentials configured, so
`getContentStore()` in `blobStore.ts` catches the `MissingBlobsEnvironmentError`
that `@netlify/blobs`'s `getStore()` throws in that situation and falls back
to a gitignored local JSON store under `.local-blobs/` — same
`current.json`/`history/` read-write-snapshot behavior, just backed by the
filesystem instead of real Blobs. (This fallback is triggered by that
specific thrown error, not by checking whether a `NETLIFY` env var is
set — `blobStore.ts` has a comment explaining why the env var alone isn't a
reliable signal.)

- To change page **content**: use `/admin` (see below) — that's the primary
  path now. Editing `content/portfolio.json` directly only matters before
  the very first save (see "seed" above).
- To change **layout/markup**: edit `app/page.tsx` or the relevant
  component in `src/components/`.
- To change **styling**: edit `src/styles/global.css` — one global
  stylesheet, not per-component scoped styles. Keep it that way;
  splitting styles across components is where visual regressions creep in
  for a page this size.
- Surface and leaf block CSS classes (`.text-*`, `.bullet-list`, `.tag`,
  `.media-*`, etc.) carry no outer spacing or padding of their own — the
  `container` block owns all of it via its `layout-p-*`/`layout-gap-*`/
  `layout-mb-*` classes (see `Container.tsx`). Adding margin or padding to a
  leaf component's own class double-spaces it against the container that
  wraps it; if spacing looks off, fix the container's layout props instead.

After any change, run `npm run check` (`tsc --noEmit`), `npm run test`, and
`npm run build` before committing.

## Content fidelity

When editing `content/portfolio.json` text on the user's behalf (as opposed
to the user editing it themselves), do not paraphrase, summarize, or
invent — copy exactly what you're given. This has bitten us before: an
earlier pass generated a design mockup via an AI tool (Stitch) that
silently reworded bullet points and invented a placeholder company name.
If you're ever tempted to have a generative tool (Stitch, an LLM prompt,
etc.) produce new copy for this page, treat its output as a *design*
reference only and reconcile the actual text by hand — see the git history
around the initial redesign for the reasoning.

## Keep `src/types.ts` in sync with `content/portfolio.json`

`src/types.ts`'s `PortfolioData`/`Block` types are a hand-maintained copy of
`content/portfolio.json`'s shape. The six hard-coded variants this section
used to describe (`job`, `placeholder`, `education`, `certificate-group`,
`gallery-item`, `note`) are gone. The content model is now generic: a
`Block` is a discriminated union over eight variants — `container`,
`heading`, `text`, `dates`, `bullets`, `badge`, `image`, `video` —
and every one of the old CV-specific layouts (a job entry, a certificate
row, a gallery card) is now just a `container` composed from these
primitives. `container` is the recursive case: its `children` field is
itself `Block[]`, so containers nest arbitrarily deep. If you add, rename,
or remove a field on any variant, update `types.ts` and the corresponding
component in `src/components/` in the same change — `npm run check`
(`tsc --noEmit`) will not catch a JSON field that no longer matches the
type unless the type itself is updated too.

`ContainerBlock`'s layout fields (`direction`, `gap`, `padding`,
`marginBottom`, `align`, `justify`, `columns`, `wrap`, `surface`) are
constrained string unions, and `src/lib/layoutOptions.ts` is the single
source of truth for their allowed values — three consumers read from it and
none may keep its own copy: `puck.config.tsx`'s `select` field `options`,
`app/admin/actions.ts`'s `assertBlocksShape` allow-list checks, and
`Container.tsx`'s className mapping. Add a layout value there, not in any
of the three consumers, or the dropdown, the save-time validator, and the
rendered class name will drift apart.

Two fields hold sanitized HTML rather than plain text: `TextBlock.html` and
`BulletsBlock.items`. Puck's richtext field is Tiptap-backed and stores
`editor.getHTML()`, and `Text.tsx`/`Bullets.tsx` render that with
`dangerouslySetInnerHTML` — so `src/lib/sanitizeBlocks.ts` runs at the save
boundary in `app/admin/actions.ts` to strip anything outside a small
allow-list (`p`, `br`, `strong`, `em`, `u`, `a`) before it can reach the
content store. Every other `Block` field (`heading.text`, `dates.text`,
`badge.text`, …) is plain text, rendered as text, never as markup.

This type has more downstream consumers than just the JSON import, since
content also flows through the admin panel: `assertBlocksShape` (above)
runtime-validates incoming blocks against this same shape before a save
reaches the content store, and `puck.config.tsx` / `src/lib/puckAdapter.ts`
map each `Block` variant to and from Puck's editor data format. A `Block`
field change that isn't reflected in all of these can pass `tsc` while
still breaking a save at runtime or silently dropping a field in the Puck
editor — update them together.

`src/lib/contentMigration.ts`'s `migratePortfolioData` upgrades a stored v1
document (the old six-variant shape) to this v2 generic model, and it runs
on **every read** of a still-v1 document (see `portfolioContent.ts`), not
as a one-off script — production content lives in Netlify Blobs with no
convenient script access, and running it on read covers every `history/`
snapshot for free. It must stay deterministic: no `randomUUID()` inside
it. `saveTabBlocksAction` looks a tab up by id inside its own
read-modify-write, and a migrated tab keeps its v1 object key verbatim as
its id — an invented random id per read would make that lookup miss and
fail every save against an unmigrated document.

## The admin panel at `/admin` is real, deliberate, and current — do not remove it

This repo has a live, working admin panel at `/admin`, built on
[Puck](https://puckeditor.com) (`@puckeditor/core`), a drag-and-drop visual
editor. It was built deliberately, in phases, as the intended replacement
for hand-editing `content/portfolio.json` — see
`docs/superpowers/specs/2026-08-20-nextjs-live-admin-panel-design.md` for
the full design rationale.

This is **not** the old Sveltia CMS panel the section above this one used to
warn about tearing down — that system (`public/admin/`, a custom OAuth
broker in `netlify/functions/`) really was removed and really shouldn't
come back uninvited. This is a separate, current implementation that
replaced it. Don't read `/admin`, `auth.ts`, `middleware.ts`,
`puck.config.tsx`, `app/api/puck/`, or the `@puckeditor/*`/`next-auth`
dependencies as leftover cruft from that old system and "helpfully" strip
them out — they are the intended, currently-in-use editing surface. If the
site owner ever wants the admin panel itself removed, that's a deliberate
feature request to act on explicitly, not a default.

**Access** is gated by Google OAuth (Auth.js v5 / `next-auth@beta`,
configured in `auth.ts` at the repo root) plus an email allow-list
(`src/lib/allowedEmails.ts`, checked against the `ALLOWED_EMAILS` env var).
This is enforced at five independent layers — each catches a different way
the others could be bypassed, so don't "simplify" this down to fewer checks:

1. Auth.js's `signIn` callback in `auth.ts` — rejects a non-allow-listed
   Google account's sign-in outright.
2. `middleware.ts` — redirects unauthenticated requests to `/admin` and
   `/api/puck` before anything renders.
3. `app/admin/page.tsx` — re-checks the session and allow-list server-side
   before rendering any content, as defense in depth beyond middleware.
4. `app/admin/actions.ts`'s `saveTabBlocksAction` and `saveTabsAction` —
   each re-checks auth again before writing, because server actions can be
   invoked directly and can't rely on the page having already gated access.
   A new action added here needs its own check; there is no shared wrapper
   doing it for you.
5. `app/api/puck/[...all]/route.ts`'s request handler — re-checks auth
   again before calling `puckHandler`, for a rationale distinct from the
   others: this route spends the Puck Cloud account's metered AI credit on
   every call, so even a request that never touches saved content still
   needs to be blocked before it reaches Puck's API, not just before it
   can write anything.

**The editor:** `puck.config.tsx` (repo root) maps this app's generic block
components (`Heading`, `Text`, `Bullets`, `Badge`, etc., plus `Container`
and its scaffolding presets `EntryCard`/`BadgeRow`/`MediaGrid`) to
Puck-editable fields; `src/lib/puckAdapter.ts` converts between this app's
`Block[]` content model and Puck's own data format;
`src/components/PuckAdmin.tsx` renders one Puck instance per tab.

**Tab management.** The tab list is content, not code: `src/components/
TabManager.tsx` (reachable from the "Manage tabs" button beside the content
tabs in `/admin`) edits the whole list and publishes it through
`saveTabsAction`, which reconciles it against the freshly-read document in
one etag-protected write — a matching id keeps that tab's blocks through a
rename or reorder, an unknown id creates an empty tab, an omitted tab is
deleted with its content. Two consequences worth knowing before touching
this: `saveTabBlocksAction` looks its tab up by id in the document it just
read (not against a static list), so it correctly refuses a save aimed at a
tab the manager deleted while an editor was still open; and deleting a tab
really does discard its blocks, with the timestamped `history/` snapshot as
the only recovery path — which is why the remove button arms on the first
click and commits on the second.

**Hero editing.** Hero doesn't go through Puck: it's a single fixed-shape
record with nothing to add, remove, or reorder, so forcing it into Puck's
block-list model would mean a config with exactly one permanently-present
block instance. Instead `src/components/HeroForm.tsx` (reachable from the
"Edit hero" button beside "Manage tabs") is a plain controlled form over
every `Hero` field, saved through `saveHeroAction` — same
auth-check/etag-protected-write/`SaveConflictError`-to-plain-message shape as
`saveTabBlocksAction` and `saveTabsAction`, because Hero and every tab live
in one `PortfolioData` document and a concurrent Hero save races a tab save
the same way two tab saves do. `Hero.dob` renders as another `MetaItem` (a
new `'calendar'` icon) and `Hero.credential` as a `<p className="credential">`
under `.role`; both are optional and plain text, never markup. Per this
file's content-fidelity rule, the capability only: `content/portfolio.json`
carries no `dob` or `credential` value, because those are the site owner's
own facts to enter through `/admin`, not something to invent as a
placeholder.

**Puck AI** (a chat panel for scaffolding/rearranging content) is wired via
`@puckeditor/plugin-ai`/`@puckeditor/cloud-client`, and needs the site
owner's own Puck Cloud account and a `PUCK_API_KEY` — the rest of the admin
panel (drag-and-drop editing, saving) works without it. It runs on Puck's
default OpenAI-backed model: Claude/Anthropic BYOK was investigated and
found **not supported at the platform level** (Puck Cloud's SDK types are
hard-locked to an `openai/`-prefixed model string, confirmed by reading the
installed SDK's type definitions directly) — this is a settled fact, not an
open question to revisit casually.

**Content-fidelity guardrail on Puck AI.** This matters for the same reason
described under "Content fidelity" above — a generative tool silently
rewording real content is a real, prior incident in this repo. Puck AI has
**four** layers of guardrail, not just prompt-level ones — verified directly
against the installed `@puckeditor/cloud-client@0.8.2` SDK's type
definitions, not just its docs:

1. `ai.context` in `app/api/puck/[...all]/route.ts` — a handler-level system
   prompt instructing the AI to only scaffold or rearrange, never rewrite
   existing real content.
2. Per-field `ai.instructions` in `puck.config.tsx` — four fields, one
   each on the `Bullets`, `Heading`, `Text`, and `Badge` components, carry
   instructions like "never rewrite an existing bullet's text".
3. `ai.mode: 'assembly'`, also set in `app/api/puck/[...all]/route.ts` — a
   genuine config-level constraint (confirmed as a real typed SDK option,
   not just a documented convention) that locks Puck AI to composing from
   this app's own configured components; the alternative `'design'` mode
   can invent new custom-styled sections outside that config.
4. `designMode.allowed` defaulting to `false` at the SDK level (see
   `node_modules/@puckeditor/cloud-client/dist/index.d.ts`), and the route
   handler passes no `designMode` object at all — so design mode isn't just
   discouraged by a prompt, it's refused by the SDK itself.

Layers 1–2 are prompt-level (the model could in principle be argued around);
layers 3–4 are config/SDK-level constraints the model can't talk its way
past. This was live-tested against the real Puck Cloud API: asking it to
add a block succeeded; asking it to "rewrite this job's bullet points to
sound more impressive" got a genuine refusal, with the page's real content
byte-identical before and after. Even so, treat this as defense in depth,
not a hard guarantee — the real backstop is the history snapshots described
above (any bad edit is recoverable) plus the fact that only the
allow-listed site owner has access at all.

## Biome: what's excluded, and why

`biome.json`'s `files.includes` excludes `**/out`, `**/.next`, and
`package-lock.json` — all three are generated (build output and the
machine-generated lockfile; formatting the lockfile alone produces tens of
thousands of diagnostics). This repo is pure TypeScript/TSX now (no Astro
files remain from the pre-migration site), so there's no equivalent
framework-specific carve-out needed the way there was during the Astro era.

`biome.json` must be **strict JSON, no `//` comments** — Biome's
config parser rejects them outright, and does so by silently falling back
to full defaults (checking `node_modules`, `out/`, `.next/`, tabs instead
of the configured spaces) rather than erroring loudly on `biome check .` —
only `biome check --config-path` on a single file surfaces the actual
parse error. If `biome check .` ever reports tens of thousands of
diagnostics again, check for a syntax error in `biome.json` first. (This
failure mode was verified directly during the Astro era of this repo —
running `biome check --write .` with a broken config deleted real code
under the illusion of formatting it — the underlying parser behavior is
unrelated to which framework the repo uses, so the same caution applies
now.)

## Design tokens are fixed

The color palette (a warm cream/gold/amber/rust/brown "sand" scale, defined
as `--sand-100` through `--sand-900` CSS custom properties in
`src/styles/global.css`, replacing an earlier navy/graphite/mint palette) was
an explicit, deliberate choice by the site owner. Don't change the hex
values as a side effect of an unrelated change — if a task calls for new UI,
reuse the existing `--sand-*` primitives or the semantic `--color-*` tokens
built on them rather than introducing new colors.

Note `--color-text-secondary` intentionally equals `--color-text-primary`
(both full-strength `--sand-900`) rather than a lighter/muted variant — any
lower-opacity blend toward the cream `--sand-100` page background drops
below WCAG AA's 4.5:1 contrast minimum for body text (verified: 90% brown
measures 4.58:1, 75% measures 3.38:1, already failing). Convey text
hierarchy with font-size/weight, not a lighter shade of this palette.
