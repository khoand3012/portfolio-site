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
`content/portfolio.json`'s shape (a discriminated union over `job`,
`placeholder`, `education`, `certificate-group`, `gallery-item`, `note` — a
real, deliberate schema, not a naming detail). If you add/rename/remove a
field, update `types.ts` and the corresponding component in
`src/components/` in the same change — `npm run check` (`tsc --noEmit`)
will not catch a JSON field that no longer matches the type unless the type
itself is updated too.

This type now has more downstream consumers than just the JSON import,
since content also flows through the admin panel: `app/admin/actions.ts`'s
`assertBlocksShape` runtime-validates incoming blocks against this same
shape before a save is allowed to reach the content store, and
`puck.config.tsx` / `src/lib/puckAdapter.ts` map each `Block` variant to and
from Puck's editor data format. A `Block` field change that isn't reflected
in all of these can pass `tsc` while still breaking a save at runtime or
silently dropping a field in the Puck editor — update them together.

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
4. `app/admin/actions.ts`'s `saveTabBlocksAction` — re-checks auth again
   before writing, because server actions can be invoked directly and can't
   rely on the page having already gated access.
5. `app/api/puck/[...all]/route.ts`'s request handler — re-checks auth
   again before calling `puckHandler`, for a rationale distinct from the
   others: this route spends the Puck Cloud account's metered AI credit on
   every call, so even a request that never touches saved content still
   needs to be blocked before it reaches Puck's API, not just before it
   can write anything.

**The editor:** `puck.config.tsx` (repo root) maps this app's existing
components (`JobCard`, `EducationCard`, etc.) to Puck-editable fields;
`src/lib/puckAdapter.ts` converts between this app's `Block[]` content model
and Puck's own data format; `src/components/PuckAdmin.tsx` renders one Puck
instance per tab.

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
2. Per-field `ai.instructions` in `puck.config.tsx` — six specific
   fields/components carry instructions like "never rewrite an existing
   bullet's text".
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

The color palette (navy blue / graphite grey / mint green / white, defined
as CSS custom properties in `src/styles/global.css`) was an explicit, deliberate
choice by the site owner. Don't change the hex values as a side effect of
an unrelated change — if a task calls for new UI, reuse the existing
`--navy-*`, `--graphite-*`, `--mint-*` tokens rather than introducing new
colors.
